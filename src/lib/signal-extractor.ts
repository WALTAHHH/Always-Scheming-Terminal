/**
 * Signal extraction pipeline for AST.
 *
 * Handles:
 * 1. Signal gate — determines if an item is worth extracting a signal from
 * 2. LLM extraction — calls OpenAI to synthesize signal_type + summary + investment_relevance_score
 * 3. Writes to signals table
 *
 * Signal extraction MUST NOT break ingestion — all errors are caught and logged.
 */

import { scoreItem } from "./importance";
import type { Database } from "./database.types";

// Type for the signals insert payload (at least this is checked)
type SignalInsert = Database["public"]["Tables"]["signals"]["Insert"];

// ── Gate Logic ─────────────────────────────────────────────────────

interface ItemForGate {
  id: string;
  title: string;
  content: string | null;
  tags: Record<string, string[]>;
  sources?: { source_type: string };
}

/**
 * Determine if an item should have a signal extracted.
 *
 * Gate fires if:
 * - importance_score >= 0.4 AND category is one of [earnings, m-and-a, fundraising, layoffs, leadership, regulatory]
 * - OR: at least one entity is resolved (company tag with entity_id) AND category is not null
 */
export function shouldExtractSignal(
  item: ItemForGate,
  importanceScore: number,
  hasResolvedEntity: boolean
): boolean {
  const categories = item.tags.category || [];
  const highValueCategories = ["earnings", "m-and-a", "fundraising", "layoffs", "leadership", "regulatory"];

  // Path 1: High importance + high value category
  if (importanceScore >= 0.4 && categories.some((cat) => highValueCategories.includes(cat))) {
    return true;
  }

  // Path 2: Has entity + has category
  if (hasResolvedEntity && categories.length > 0) {
    return true;
  }

  return false;
}

// ── LLM Extraction ─────────────────────────────────────────────────

interface SignalExtractionResult {
  signal_type:
    | "acquisition"
    | "fundraising"
    | "earnings"
    | "layoffs"
    | "leadership"
    | "product_launch"
    | "regulatory"
    | "platform_change"
    | "macro";
  summary: string;
  investment_relevance_score: number;
  reasoning: string;
}

const SIGNAL_EXTRACTION_PROMPT = `You are an investment analyst specializing in the gaming industry. Extract a structured signal from the following article.

Return a JSON object with:
- signal_type: one of [acquisition, fundraising, earnings, layoffs, leadership, product_launch, regulatory, platform_change, macro]
- summary: one concise sentence describing what happened and why it matters for investors (max 200 chars)
- investment_relevance_score: float 0-1 (0 = noise, 1 = market-moving event)
- reasoning: brief explanation of the score (1-2 sentences)

Article title: {TITLE}
Article content: {CONTENT}

Respond with valid JSON only, no markdown fences.`;

/**
 * Call OpenAI to extract signal from item.
 * Hard timeout: 6s.
 */
async function extractSignalWithLLM(
  title: string,
  content: string | null
): Promise<SignalExtractionResult | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn("[signal-extractor] OPENAI_API_KEY not set, skipping LLM extraction");
    return null;
  }

  const prompt = SIGNAL_EXTRACTION_PROMPT.replace("{TITLE}", title).replace(
    "{CONTENT}",
    content?.slice(0, 2000) || "(no content)"
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[signal-extractor] OpenAI API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    // Parse JSON response
    const parsed = JSON.parse(text) as SignalExtractionResult;

    // Validate shape
    if (
      !parsed.signal_type ||
      !parsed.summary ||
      typeof parsed.investment_relevance_score !== "number"
    ) {
      console.warn("[signal-extractor] Invalid response shape from OpenAI");
      return null;
    }

    return parsed;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[signal-extractor] LLM call timed out after 6s");
    } else {
      console.warn("[signal-extractor] LLM call failed:", err);
    }
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────

interface ExtractSignalOptions {
  supabase: any; // TODO: type as SupabaseClient<Database> after migrations run + types regenerated
  item: {
    id: string;
    title: string;
    content: string | null;
    tags: Record<string, string[]>;
    sources?: { source_type: string };
  };
  hasResolvedEntity: boolean;
}

/**
 * Extract and store signal for an item if it passes the gate.
 * Non-throwing — all errors are caught and logged.
 */
export async function extractSignal(options: ExtractSignalOptions): Promise<void> {
  const { supabase, item, hasResolvedEntity } = options;

  try {
    // Compute importance score (gate dependency)
    const importanceScore = scoreItem(item as Parameters<typeof scoreItem>[0]);

    // Check gate
    if (!shouldExtractSignal(item, importanceScore, hasResolvedEntity)) {
      return; // Silent — gate didn't fire
    }

    // Extract signal via LLM
    const signal = await extractSignalWithLLM(item.title, item.content);
    if (!signal) {
      // LLM failed or timed out — log but don't break ingestion
      console.warn(`[signal-extractor] Failed to extract signal for item ${item.id}`);
      return;
    }

    // Write to signals table
    const payload: SignalInsert = {
      item_id: item.id,
      signal_type: signal.signal_type,
      summary: signal.summary,
      investment_relevance_score: signal.investment_relevance_score,
      raw_llm_output: signal as unknown as SignalInsert["raw_llm_output"],
      model_used: "gpt-4o-mini",
    };

    const { error } = await supabase.from("signals").insert(payload);

    if (error) {
      console.warn(`[signal-extractor] Failed to write signal for item ${item.id}:`, error.message);
    }
  } catch (err) {
    // Catch-all — signal extraction must never break ingestion
    console.error(`[signal-extractor] Unexpected error for item ${item.id}:`, err);
  }
}
