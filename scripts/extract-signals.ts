/**
 * Signal extraction runner.
 * Extracts structured investment signals from ingested items using Gemini 2.0 Flash.
 * 
 * Run: npx tsx scripts/extract-signals.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

if (!geminiApiKey) {
  console.error("❌ Missing GEMINI_API_KEY in environment");
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
const EXTRACTION_TIMEOUT_MS = 8000;
const MAX_CONCURRENT = 3;

interface EligibleItem {
  id: string;
  title: string;
  url: string;
  content: string | null;
  published_at: string | null;
  companies: string[];
  categories: string[];
}

interface SignalExtraction {
  signal_type: string;
  summary: string;
  investment_relevance_score: number;
  reasoning: string;
}

const VALID_SIGNAL_TYPES = new Set([
  "acquisition",
  "fundraising",
  "earnings",
  "layoffs",
  "leadership",
  "product_launch",
  "regulatory",
  "platform_change",
  "macro",
]);

/**
 * Query items eligible for signal extraction.
 * Items must not already have a signal extracted (no matching row in signals table).
 */
async function getEligibleItems(): Promise<EligibleItem[]> {
  // Get items that don't have signals yet
  const { data: items, error } = await supabase
    .from("items")
    .select(`
      id,
      title,
      url,
      content,
      published_at
    `)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to fetch items: ${error.message}`);
  }

  if (!items || items.length === 0) {
    return [];
  }

  // Get existing signals to filter out already-processed items
  const itemIds = items.map((i: any) => i.id);
  const { data: existingSignals } = await supabase
    .from("signals")
    .select("item_id")
    .in("item_id", itemIds);

  const processedItemIds = new Set((existingSignals as any)?.map((s: any) => s.item_id) || []);

  // Filter to only unprocessed items
  const unprocessedItems = items.filter((item: any) => !processedItemIds.has(item.id));

  if (unprocessedItems.length === 0) {
    return [];
  }

  // Fetch tags for all unprocessed items in a single query (fix N+1)
  const unprocessedItemIds = unprocessedItems.map((i: any) => i.id);
  const { data: allTags } = await supabase
    .from("item_tags")
    .select("item_id, dimension, value")
    .in("item_id", unprocessedItemIds);

  // Group tags by item_id
  const tagsByItemId = new Map<string, { dimension: string; value: string }[]>();
  (allTags as any)?.forEach((tag: any) => {
    if (!tagsByItemId.has(tag.item_id)) {
      tagsByItemId.set(tag.item_id, []);
    }
    tagsByItemId.get(tag.item_id)!.push({ dimension: tag.dimension, value: tag.value });
  });

  // Build eligible items with their tags
  const eligibleItems: EligibleItem[] = unprocessedItems.map((item: any) => {
    const tags = tagsByItemId.get(item.id) || [];
    const companies = tags.filter((t) => t.dimension === "company").map((t) => t.value);
    const categories = tags.filter((t) => t.dimension === "category").map((t) => t.value);

    return {
      id: item.id,
      title: item.title,
      url: item.url,
      content: item.content,
      published_at: item.published_at,
      companies,
      categories,
    };
  });

  return eligibleItems;
}

/**
 * Signal extraction gate — skip items that are too noisy or empty.
 */
function shouldExtractSignal(item: EligibleItem): boolean {
  // Skip if both companies and categories are empty
  if (item.companies.length === 0 && item.categories.length === 0) {
    return false;
  }

  // Skip if content is null or too short
  if (!item.content || item.content.length < 100) {
    return false;
  }

  return true;
}

/**
 * Extract signal from item using Gemini 2.0 Flash.
 */
async function extractSignalFromItem(item: EligibleItem): Promise<SignalExtraction | null> {
  const prompt = `You are a financial analyst assistant specializing in the interactive entertainment industry. Given a news item, extract a structured investment signal.

ITEM TITLE: ${item.title}
ITEM URL: ${item.url}
PUBLISHED: ${item.published_at || "unknown"}
COMPANIES MENTIONED: ${item.companies.join(", ") || "none"}
CATEGORIES: ${item.categories.join(", ") || "none"}

CONTENT:
${item.content}

---

Respond ONLY with valid JSON, no preamble, no markdown:

{
  "signal_type": "<acquisition|fundraising|earnings|layoffs|leadership|product_launch|regulatory|platform_change|macro>",
  "summary": "<one sentence, max 120 chars, factual>",
  "investment_relevance_score": <float 0.0–1.0>,
  "reasoning": "<1-2 sentences>"
}

Scoring:
- 0.8–1.0: Material financial event (M&A, earnings, major layoffs, funding >$50M)
- 0.5–0.79: Industry signal (product launch, leadership change, regulatory)
- 0.2–0.49: Background context (market trend, minor update)
- 0.0–0.19: Not investment-relevant`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  Gemini API error for item ${item.id}: ${response.status} ${errorText}`);
      return null;
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      console.error(`  No candidates returned for item ${item.id}`);
      return null;
    }

    const content = data.candidates[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error(`  Empty content returned for item ${item.id}`);
      return null;
    }

    // Parse JSON response
    let parsed: SignalExtraction;
    try {
      // Strip markdown code fences if present
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error(`  JSON parse failed for item ${item.id}:`, content);
      return null;
    }

    // Validate response
    if (!parsed.signal_type || !VALID_SIGNAL_TYPES.has(parsed.signal_type)) {
      console.error(`  Invalid signal_type for item ${item.id}: ${parsed.signal_type}`);
      return null;
    }

    if (typeof parsed.investment_relevance_score !== "number" || parsed.investment_relevance_score < 0 || parsed.investment_relevance_score > 1) {
      console.error(`  Invalid score for item ${item.id}: ${parsed.investment_relevance_score}`);
      return null;
    }

    if (!parsed.summary || parsed.summary.length === 0) {
      console.error(`  Empty summary for item ${item.id}`);
      return null;
    }

    return parsed;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.error(`  Timeout extracting signal for item ${item.id}`);
    } else {
      console.error(`  Error extracting signal for item ${item.id}:`, error);
    }
    return null;
  }
}

/**
 * Write extracted signal to database.
 */
async function writeSignal(itemId: string, extraction: SignalExtraction): Promise<boolean> {
  const { error } = await supabase.from("signals").insert({
    item_id: itemId,
    signal_type: extraction.signal_type,
    summary: extraction.summary,
    investment_relevance_score: extraction.investment_relevance_score,
    raw_llm_output: extraction as any,
    model_used: GEMINI_MODEL,
  } as any);

  if (error) {
    console.error(`  Failed to write signal for item ${itemId}:`, error.message);
    return false;
  }

  return true;
}

/**
 * Process items in batches with concurrency limit.
 */
async function processBatch(items: EligibleItem[]): Promise<{ extracted: number; skipped: number; failed: number }> {
  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  // Process in chunks respecting MAX_CONCURRENT
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    const chunk = items.slice(i, i + MAX_CONCURRENT);

    await Promise.all(
      chunk.map(async (item) => {
        // Apply gate
        if (!shouldExtractSignal(item)) {
          skipped++;
          return;
        }

        // Extract signal
        const extraction = await extractSignalFromItem(item);
        if (!extraction) {
          failed++;
          return;
        }

        // Write to database
        const written = await writeSignal(item.id, extraction);
        if (written) {
          extracted++;
          console.log(`  ✓ ${item.title.slice(0, 60)}... → ${extraction.signal_type} (score: ${extraction.investment_relevance_score.toFixed(2)})`);
        } else {
          failed++;
        }
      })
    );
  }

  return { extracted, skipped, failed };
}

async function main() {
  console.log("⚡ Starting signal extraction...\n");

  const items = await getEligibleItems();
  console.log(`  Found ${items.length} eligible items\n`);

  if (items.length === 0) {
    console.log("  No items to process");
    return;
  }

  const result = await processBatch(items);

  console.log(`\n  Summary:`);
  console.log(`    Extracted: ${result.extracted}`);
  console.log(`    Skipped (gate): ${result.skipped}`);
  console.log(`    Failed: ${result.failed}`);
  console.log(`    Total processed: ${items.length}`);
}

main().catch((err) => {
  console.error("Signal extraction failed:", err);
  process.exit(1);
});
