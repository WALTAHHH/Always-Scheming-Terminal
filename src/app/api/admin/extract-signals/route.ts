import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const VALID_SIGNAL_TYPES = new Set([
  "acquisition", "fundraising", "earnings", "layoffs", "leadership",
  "product_launch", "regulatory", "platform_change", "macro",
]);

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function callGemini(title: string, body: string, companies: string[], categories: string[]): Promise<{
  signal_type: string;
  summary: string;
  investment_relevance_score: number;
  reasoning: string;
} | { error: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { error: "GOOGLE_AI_API_KEY not set" };

  // Truncate body to first 1500 chars
  const truncatedBody = body ? body.slice(0, 1500) : "";

  const prompt = `You are a financial analyst specializing in the gaming industry. Extract a structured investment signal from this article.

Title: ${title}
Body: ${truncatedBody}
Companies: ${companies.join(", ") || "none"}
Categories: ${categories.join(", ") || "none"}

Return ONLY valid JSON, no markdown:
{"signal_type":"acquisition|fundraising|earnings|layoffs|leadership|product_launch|regulatory|platform_change|macro","summary":"ONE declarative sentence, max 100 chars. State the specific fact: company, action, number if known. BAD: 'Xbox is undergoing restructuring.' GOOD: 'Microsoft cuts 3,200 Xbox roles, closing Bethesda studios.'","investment_relevance_score":0.0-1.0,"reasoning":"1-2 sentences"}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 300 },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text();
      return { error: `Gemini ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return { error: "Empty Gemini response" };

    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(clean);

    if (!VALID_SIGNAL_TYPES.has(parsed.signal_type)) {
      return { error: `Invalid signal_type: "${parsed.signal_type}"` };
    }
    if (typeof parsed.investment_relevance_score !== "number") {
      return { error: `Invalid score: ${parsed.investment_relevance_score}` };
    }
    if (!parsed.summary) {
      return { error: "Missing summary" };
    }

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg.includes("abort") ? "Gemini timeout (10s)" : `Gemini error: ${msg}` };
  }
}

async function checkDuplicateSignal(
  supabase: ReturnType<typeof getServiceClient>,
  companies: string[],
  entityIds: string[],
  signalType: string
): Promise<boolean> {
  if (companies.length === 0) return false;

  // Get the last 48 hours timestamp
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Step 1: Find recent signals (last 48h) with the same signal_type
  const { data: recentSignals, error } = await supabase
    .from("signals")
    .select("item_id")
    .eq("signal_type", signalType)
    .gte("created_at", fortyEightHoursAgo)
    .limit(50);

  if (error) {
    console.error("Deduplication query (step 1) failed:", error);
    return false;
  }

  if (!recentSignals || recentSignals.length === 0) {
    return false;
  }

  // Step 2: Get company content_tags for those item_ids
  const signalItemIds = recentSignals.map((s) => s.item_id);
  const { data: companyTags, error: tagsError } = await supabase
    .from("content_tags")
    .select("value, content_id")
    .in("content_id", signalItemIds)
    .eq("dimension", "company");

  if (tagsError) {
    console.error("Deduplication query (step 2) failed:", tagsError);
    return false;
  }

  if (!companyTags || companyTags.length === 0) {
    return false;
  }

  // Step 3: Check for company overlap
  const newKeys = new Set([
    ...entityIds.map((id) => `eid:${id}`),
    ...companies.map((c) => `name:${c.toLowerCase()}`),
  ]);
  const existingKeys = new Set(
    companyTags.map((t: any) =>
      t.entity_id ? `eid:${t.entity_id}` : `name:${t.value.toLowerCase()}`
    )
  );
  for (const key of Array.from(newKeys)) {
    if (existingKeys.has(key)) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  // Allow Vercel cron to bypass admin auth
  const isCron = req.headers.get("x-vercel-cron") === "1";
  
  if (!isCron) {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;
  }

  const supabase = getServiceClient();

  // Change 2: Use signals_extracted_at flag instead of re-scanning all content
  const { data: items, error: fetchError } = await supabase
    .from("content")
    .select("id, title, body, tags")
    .is("signals_extracted_at", null) // Only items that haven't been processed
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100); // Process up to 100 unprocessed items at a time

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const eligible = (items || []).filter((item) => {
    const tags = (item.tags as Record<string, string[]>) || {};
    return tags.company?.length > 0 && tags.category?.length > 0;
  });

  const results: { id: string; title: string; status: string; detail?: string }[] = [];

  for (const item of eligible) {
    const tags = (item.tags as Record<string, string[]>) || {};
    const companies = tags.company || [];
    const categories = tags.category || [];

    const signal = await callGemini(item.title, item.body || "", companies, categories);

    if ("error" in signal) {
      results.push({ id: item.id, title: item.title.slice(0, 60), status: "llm_error", detail: signal.error });
      // Still mark as processed to avoid retrying failed items
      await supabase
        .from("content")
        .update({ signals_extracted_at: new Date().toISOString() })
        .eq("id", item.id);
      continue;
    }

    // Change 1: Entity+type deduplication
    const { data: itemTags } = await supabase
      .from("content_tags")
      .select("entity_id")
      .eq("content_id", item.id)
      .eq("dimension", "company")
      .not("entity_id", "is", null);
    const entityIds = (itemTags || []).map((t: any) => t.entity_id);
    const isDuplicate = await checkDuplicateSignal(supabase, companies, entityIds, signal.signal_type);
    if (isDuplicate) {
      results.push({ id: item.id, title: item.title.slice(0, 60), status: "deduped", detail: `Duplicate for ${signal.signal_type}` });
      // Mark as processed (deduped)
      await supabase
        .from("content")
        .update({ signals_extracted_at: new Date().toISOString() })
        .eq("id", item.id);
      continue;
    }

    const { error: insertError } = await supabase.from("signals").insert({
      item_id: item.id,
      signal_type: signal.signal_type,
      summary: signal.summary,
      investment_relevance_score: signal.investment_relevance_score,
      raw_llm_output: signal as any,
      model_used: "gemini-2.5-flash-lite",
    });

    if (insertError) {
      results.push({ id: item.id, title: item.title.slice(0, 60), status: "insert_error", detail: insertError.message });
    } else {
      results.push({ id: item.id, title: item.title.slice(0, 60), status: "ok", detail: `${signal.signal_type} (${signal.investment_relevance_score.toFixed(2)})` });
    }

    // Change 2: Set signals_extracted_at on every processed item
    await supabase
      .from("content")
      .update({ signals_extracted_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  const { count: totalSignals } = await supabase
    .from("signals")
    .select("*", { count: "exact", head: true });

  const extracted = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status !== "ok" && r.status !== "deduped");
  const deduped = results.filter((r) => r.status === "deduped").length;

  return NextResponse.json({
    ok: true,
    summary: {
      eligible: eligible.length,
      processed: eligible.length,
      extracted,
      deduped,
      errors: errors.length,
      totalSignalsInDb: totalSignals,
    },
    deduped: deduped > 0 ? results.filter(r => r.status === "deduped").slice(0, 10) : undefined,
    errors: errors.length > 0 ? errors : undefined,
    results: results.slice(0, 20),
  });
}