import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { requireApiKey } from '@/lib/api-auth';
import { generateEmbedding } from '@/lib/embeddings';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function synthesizeBrief(query: string, articles: Array<{ title: string; body: string | null }>): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return 'Unable to generate brief (GOOGLE_AI_API_KEY not set).';

  const ctx = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.body ? a.body.slice(0, 800) : '(no content)'}`)
    .join('\n\n');

  const prompt = `You are an investment analyst covering the gaming industry. Answer the query concisely (2-3 paragraphs) based only on the provided articles. Cite article numbers inline, e.g. [1].

Query: ${query}

Articles:
${ctx}`;

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) return `LLM error ${res.status}`;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response generated.';
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) return auth;

  let body: { query?: string; limit?: number; date_from?: string; entity?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { query, limit = 5, date_from, entity } = body;
  if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const k = Math.min(limit, 20);

  // Try vector search first; fall back to recency if embeddings aren't populated yet
  const embedding = await generateEmbedding(query);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articles: any[] = [];

  if (embedding.length === 768) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('match_content', {
      query_embedding: embedding,
      match_limit: k,
      date_from: date_from ?? null,
      entity_value: entity ?? null,
    });
    if (!error && data) articles = data;
  }

  // Fallback: recency-based retrieval
  if (articles.length === 0) {
    let contentIds: string[] | undefined;
    if (entity) {
      const { data: tagMatches } = await supabase
        .from('content_tags')
        .select('content_id')
        .eq('dimension', 'company')
        .eq('value', entity)
        .limit(100);
      contentIds = tagMatches?.map(t => t.content_id).filter((id): id is string => !!id) ?? [];
      if (contentIds.length === 0) {
        articles = [];
      }
    }
    // Only query if we still have no articles AND (no entity filter or we have contentIds to filter)
    if (articles.length === 0 && (!entity || (contentIds && contentIds.length > 0))) {
      let q = supabase
        .from('content')
        .select('id, title, body, url, published_at, signals (signal_type, summary)')
        .order('published_at', { ascending: false })
        .limit(k);
      if (date_from) q = q.gte('published_at', date_from);
      if (contentIds && contentIds.length > 0) q = q.in('id', contentIds);
      const { data } = await q;
      articles = data ?? [];
    }
  }

  const brief = await synthesizeBrief(query, articles);

  return NextResponse.json({
    brief,
    sources: articles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      published_at: a.published_at,
      signal_type: a.signals?.[0]?.signal_type ?? a.signal_type ?? null,
      summary: a.signals?.[0]?.summary ?? a.summary ?? null,
    })),
    model: 'gemini-2.5-flash-lite',
  });
}
