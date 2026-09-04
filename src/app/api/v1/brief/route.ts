import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireApiKey } from "@/lib/api-auth";
import { generateEmbedding } from "@/lib/embeddings";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface BriefRequest {
  query: string;
  limit?: number;
  date_from?: string; // ISO string
  entity?: string;
}

interface Source {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
  signal_type: string | null;
  summary: string | null;
}

interface BriefResponse {
  brief: string;
  sources: Source[];
  model: string;
}

/**
 * Call Gemini Flash to synthesize a brief from query and articles.
 */
async function generateBrief(
  query: string,
  articles: Array<{ title: string; body: string | null }>
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[brief] GOOGLE_AI_API_KEY not set, skipping LLM synthesis");
    return "Unable to generate brief (missing API key).";
  }

  const articlesText = articles
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title}\n${a.body ? a.body.slice(0, 1000) : "(no content)"}`
    )
    .join("\n\n");

  const prompt = `You are an investment analyst synthesizing a brief answer to a query based on provided articles.

Query: ${query}

Relevant articles:
${articlesText}

Write a concise 1-3 paragraph brief that directly answers the query. Focus on facts from the articles, avoid speculation. If the articles do not contain enough information, state that. Cite articles by number [1], [2], etc. where relevant.

Brief answer:`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 800 },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[brief] Gemini API error: ${response.status} ${response.statusText}`);
      return "Failed to generate brief (API error).";
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || "No response from LLM.";
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("[brief] LLM call timed out after 10s");
    } else {
      console.warn("[brief] LLM call failed:", err);
    }
    return "Failed to generate brief (internal error).";
  }
}

export async function POST(request: Request) {
  // API key authentication
  const auth = await requireApiKey(request);
  if (!("ok" in auth)) {
    return auth; // NextResponse with error
  }

  // Parse request body
  let body: BriefRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, limit = 5, date_from, entity } = body;
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing or invalid 'query'" }, { status: 400 });
  }

  const safeLimit = Math.min(Math.max(limit, 1), 20); // clamp 1-20

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  if (queryEmbedding.length === 0) {
    return NextResponse.json(
      { error: "Failed to generate query embedding" },
      { status: 500 }
    );
  }

  // Vector similarity search via RPC
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const { data: matchedItems, error: rpcError } = await (supabase.rpc as any)(
    "match_content",
    {
      query_embedding: queryEmbedding,
      match_limit: safeLimit,
      date_from: date_from || null,
      entity_value: entity || null,
    }
  );

  if (rpcError) {
    console.error("[brief] RPC error:", rpcError);
    return NextResponse.json({ error: "Database search failed" }, { status: 500 });
  }

  // Cast matchedItems to array
  const items = (matchedItems as any[]) || [];

  // If no results, return empty brief
  if (items.length === 0) {
    return NextResponse.json({
      brief: "No relevant articles found.",
      sources: [],
      model: "none",
    });
  }

  // Convert matched items to articles format for LLM
  const articles = items.map((item) => ({
    title: item.title,
    body: item.body,
  }));

  // Generate brief with Gemini
  const brief = await generateBrief(query, articles);

  // Build sources array
  const sources: Source[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    published_at: item.published_at,
    signal_type: item.signal_type,
    summary: item.summary,
  }));

  const response: BriefResponse = {
    brief,
    sources,
    model: "gemini-2.5-flash-lite",
  };

  return NextResponse.json(response);
}