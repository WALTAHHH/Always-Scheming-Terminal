import { NextRequest, NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireApiKey } from "@/lib/api-auth";
import { generateEmbedding } from "@/lib/embeddings";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function makeSupabase() {
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

// ── Gemini synthesis (shared with /api/v1/brief) ──────────────────────────────

async function synthesizeBrief(
  query: string,
  articles: Array<{ title: string; body: string | null }>
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return "Unable to generate brief (GOOGLE_AI_API_KEY not set).";

  const ctx = articles
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title}\n${a.body ? a.body.slice(0, 800) : "(no content)"}`
    )
    .join("\n\n");

  const prompt = `You are an investment analyst covering the gaming industry. Answer the query concisely (2-3 paragraphs) based only on the provided articles. Cite article numbers inline, e.g. [1].

Query: ${query}

Articles:
${ctx}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) return `LLM error ${res.status}`;
  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response generated."
  );
}

// ── Build MCP server with tools ───────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({
    name: "ast",
    version: "1.0.0",
  });

  // Tool: get_signals
  server.tool(
    "ast_get_signals",
    "Get recent investment signals (M&A, fundraising, earnings, layoffs, leadership…) extracted from gaming industry news.",
    {
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Max signals to return (default 10)"),
      min_score: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Min investment relevance 0-1 (default 0.3)"),
      signal_type: z
        .enum([
          "acquisition",
          "fundraising",
          "earnings",
          "layoffs",
          "leadership",
          "product_launch",
          "regulatory",
          "platform_change",
          "macro",
        ])
        .optional()
        .describe("Filter to a specific signal type"),
    },
    async ({ limit = 10, min_score = 0.3, signal_type }) => {
      const sb = makeSupabase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb as any)
        .from("signals")
        .select(
          `id, signal_type, summary, investment_relevance_score, created_at,
           content:content_id (id, title, url, published_at,
             content_tags (value, dimension, entity_id))`
        )
        .gte("investment_relevance_score", min_score)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (signal_type) q = q.eq("signal_type", signal_type);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signals = (data ?? []).map((s: any) => ({
        id: s.id,
        signal_type: s.signal_type,
        summary: s.summary,
        investment_relevance_score: s.investment_relevance_score,
        companies: (s.content?.content_tags ?? [])
          .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (t: any) => t.dimension === "company" && t.entity_id !== null
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((t: any) => t.value),
        title: s.content?.title ?? "",
        url: s.content?.url ?? "",
        published_at: s.content?.published_at ?? null,
        created_at: s.created_at,
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(signals, null, 2) }],
      };
    }
  );

  // Tool: get_items
  server.tool(
    "ast_get_items",
    "Get recent gaming industry news articles with tags and importance scores.",
    {
      limit: z.number().min(1).max(100).optional().describe("Max articles (default 20)"),
      date_from: z.string().optional().describe("ISO date, e.g. 2026-08-01"),
      date_to: z.string().optional().describe("ISO date"),
      min_importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Min importance score (0.4+ for high-signal only)"),
    },
    async ({ limit = 20, date_from, date_to, min_importance }) => {
      const sb = makeSupabase();
      let q = sb
        .from("content")
        .select("id, title, url, published_at, importance_score, content_tags(dimension, value)")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (date_from) q = q.gte("published_at", date_from);
        if (entity) {
          q = q.eq("content_tags.dimension", "company").eq("content_tags.value", entity);
        }
      if (date_to) q = q.lte("published_at", date_to);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (min_importance != null) q = (q as any).gte("importance_score", min_importance);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    }
  );

  // Tool: get_entities
  server.tool(
    "ast_get_entities",
    "List tracked gaming companies and entities (canonical names, tickers, segments).",
    {
      limit: z.number().min(1).max(200).optional().describe("Max entities (default 100)"),
      entity_type: z.string().optional().describe("Filter by type, e.g. 'company'"),
    },
    async ({ limit = 100, entity_type }) => {
      const sb = makeSupabase();
      let q = sb
        .from("entities")
        .select("id, canonical_name, entity_type, ticker, exchange, segment, market_cap_b, is_public")
        .limit(limit);
      if (entity_type) q = q.eq("entity_type", entity_type);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data ?? [], null, 2) }],
      };
    }
  );

  // Tool: brief
  server.tool(
    "ast_brief",
    "Get a synthesized intelligence brief answering a natural-language query about gaming industry news. Uses RAG over AST's article database. Best for questions like 'What happened with Roblox in the last 30 days?' or 'Summarize recent M&A activity.'",
    {
      query: z.string().describe("Natural language question about gaming industry news"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Source articles to retrieve (default 5)"),
      date_from: z.string().optional().describe("ISO date to restrict source articles"),
      entity: z.string().optional().describe("Company name to focus on, e.g. 'Roblox'"),
    },
    async ({ query, limit = 5, date_from, entity }) => {
      const sb = makeSupabase();
      const k = Math.min(limit, 20);
      const embedding = await generateEmbedding(query);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let articles: any[] = [];

      if (embedding.length === 768) {
        const { data } = await (sb as any).rpc("match_content", {
          query_embedding: embedding,
          match_limit: k,
          date_from: date_from ?? null,
          entity_value: entity ?? null,
        });
        if (data) articles = data;
      }

      if (articles.length === 0) {
        let q = sb
          .from("content")
          .select("id, title, body, url, published_at, content_tags(dimension, value)")
          .order("published_at", { ascending: false })
          .limit(k);
        if (date_from) q = q.gte("published_at", date_from);
        if (entity) {
          q = q.eq("content_tags.dimension", "company").eq("content_tags.value", entity);
        }
        const { data } = await q;
        articles = data ?? [];
      }

      const brief = await synthesizeBrief(query, articles);
      const result = {
        brief,
        sources: articles.map((a) => ({
          title: a.title,
          url: a.url,
          published_at: a.published_at,
          signal_type: a.signal_type ?? null,
        })),
        model: "gemini-2.5-flash-lite",
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

// ── Request handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth — same api_keys table as /api/v1/*
  const authResult = await requireApiKey(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const server = buildMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,      // return plain JSON, not SSE stream
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    await server.close();
    return response;
  } catch (err) {
    console.error("[mcp] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 }
    );
  }
}

// MCP spec requires GET to return 405 for stateless servers
export async function GET() {
  return NextResponse.json(
    { error: "MCP server is stateless — use POST" },
    { status: 405 }
  );
}
