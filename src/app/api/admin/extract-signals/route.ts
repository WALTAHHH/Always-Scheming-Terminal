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

async function callGemini(title: string, companies: string[], categories: string[]): Promise<{
  signal_type: string;
  summary: string;
  investment_relevance_score: number;
  reasoning: string;
} | { error: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { error: "GOOGLE_AI_API_KEY not set" };

  const prompt = `You are a financial analyst specializing in the gaming industry. Extract a structured investment signal from this article.

Title: ${title}
Companies: ${companies.join(", ") || "none"}
Categories: ${categories.join(", ") || "none"}

Return ONLY valid JSON, no markdown:
{"signal_type":"acquisition|fundraising|earnings|layoffs|leadership|product_launch|regulatory|platform_change|macro","summary":"one sentence max 120 chars","investment_relevance_score":0.0-1.0,"reasoning":"1-2 sentences"}`;

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

export async function POST(req: NextRequest) {
  // Allow Vercel cron to bypass admin auth
  const isCron = req.headers.get("x-vercel-cron") === "1";
  
  if (!isCron) {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;
  }

  const supabase = getServiceClient();

  const { data: items, error: fetchError } = await supabase
    .from("content")
    .select("id, title, body, tags, sources!inner(source_type)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const eligible = (items || []).filter((item) => {
    const tags = (item.tags as Record<string, string[]>) || {};
    return tags.company?.length > 0 && tags.category?.length > 0;
  });

  const eligibleIds = eligible.map((i) => i.id);
  const { data: existingSignals } = await supabase
    .from("signals")
    .select("item_id")
    .in("item_id", eligibleIds);

  const signaled = new Set((existingSignals || []).map((s: any) => s.item_id));
  const todo = eligible.filter((i) => !signaled.has(i.id));

  const results: { id: string; title: string; status: string; detail?: string }[] = [];

  for (const item of todo) {
    const tags = (item.tags as Record<string, string[]>) || {};
    const companies = tags.company || [];
    const categories = tags.category || [];

    const signal = await callGemini(item.title, companies, categories);

    if ("error" in signal) {
      results.push({ id: item.id, title: item.title.slice(0, 60), status: "llm_error", detail: signal.error });
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
  }

  const { count: totalSignals } = await supabase
    .from("signals")
    .select("*", { count: "exact", head: true });

  const extracted = results.filter((r) => r.status === "ok").length;
  const errors = results.filter((r) => r.status !== "ok");

  return NextResponse.json({
    ok: true,
    summary: {
      eligible: eligible.length,
      alreadySignaled: signaled.size,
      processed: todo.length,
      extracted,
      errors: errors.length,
      totalSignalsInDb: totalSignals,
    },
    errors: errors.length > 0 ? errors : undefined,
    results: results.slice(0, 20),
  });
}
