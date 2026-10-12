import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { clusterItems } from "@/lib/cluster";
import type { FeedItem } from "@/lib/database.types";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const minScore = parseFloat(searchParams.get("min_score") || "0.3");
  const signalType = searchParams.get("signal_type") || null;
  const company = searchParams.get("company") || null;
  const since = searchParams.get("since") || null;
  const until = searchParams.get("until") || null;
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // Single query with JOINs
  let query = supabase
    .from("signals")
    .select(`
      id, signal_type, summary, investment_relevance_score, created_at,
      content:content_id (
        id, title, url, published_at,
        content_tags (value, dimension, entity_id)
      )
    `)
    .gte("investment_relevance_score", minScore);

  if (signalType) query = query.eq("signal_type", signalType);
  if (since) query = query.gte("content.published_at", since);
  if (until) query = query.lte("content.published_at", until);

  const { data: signalsData, error: signalsError } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (signalsError) {
    return NextResponse.json({ error: signalsError.message }, { status: 500 });
  }

  // Map to internal shape with content_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signalsWithDetailsInternal = ((signalsData || []) as any[]).map((signal) => {
    // Extract company tags where dimension = 'company' and entity_id is not null
    const companyTags = (signal.content?.content_tags || [])
      .filter((tag: any) => tag.dimension === "company" && tag.entity_id !== null)
      .map((tag: any) => tag.value);

    return {
      id: signal.id,
      content_id: signal.content?.id ?? signal.id,
      signal_type: signal.signal_type,
      summary: signal.summary,
      investment_relevance_score: signal.investment_relevance_score,
      companies: companyTags,
      title: signal.content?.title || "",
      url: signal.content?.url || "",
      published_at: signal.content?.published_at || null,
      created_at: signal.created_at,
    };
  });

  let filtered = signalsWithDetailsInternal;

  if (company) {
    filtered = filtered.filter(s =>
      s.companies.some((c: any) => c.toLowerCase().includes(company.toLowerCase()))
    );
  }

  if (since) {
    filtered = filtered.filter(s => s.published_at && new Date(s.published_at) >= new Date(since));
  }

  if (until) {
    filtered = filtered.filter(s => s.published_at && new Date(s.published_at) <= new Date(until));
  }

  // Map content_id → signal (keep highest score per content)
  const signalByContentId = new Map<string, typeof signalsWithDetailsInternal[0]>();
  for (const signal of filtered) {
    const existing = signalByContentId.get(signal.content_id);
    if (!existing || signal.investment_relevance_score > existing.investment_relevance_score) {
      signalByContentId.set(signal.content_id, signal);
    }
  }

  // Build FeedItem objects for clustering (only need title, published_at, id)
  const feedItemsUnsorted: FeedItem[] = Array.from(signalByContentId.values()).map((signal) => ({
    id: signal.content_id,
    title: signal.title,
    published_at: signal.published_at,
    // Required Content fields we don't have — fill with null/empty defaults
    source_id: null,
    external_id: null,
    body: null,
    author: null,
    ingested_at: null,
    tags: null,
    content_type: "",
    embedding: null,
    signals_extracted_at: null,
    // Required FeedItem addition
    sources: null,
    // Unused but required by Content
    url: signal.url,
  }));
  // Sort by published_at descending (most recent first) as the feed UI does
  const feedItems = feedItemsUnsorted.sort((a, b) => 
    new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
  );

  // Cluster articles by title similarity within 72h
  const clusters = clusterItems(feedItems);
  const deduped = clusters.map((cluster) => {
    const candidates = [cluster.lead, ...cluster.related]
      .map((item) => signalByContentId.get(item.id))
      .filter((s): s is NonNullable<typeof s> => s != null);
    // Pick highest scoring signal among candidates
    return candidates.reduce((best, s) =>
      s.investment_relevance_score > best.investment_relevance_score ? s : best
    );
  }).filter(Boolean);

  // Strip internal content_id field from final response
  const signalsWithDetails = deduped.map(({ content_id, ...rest }) => rest);

  return NextResponse.json({
    signals: signalsWithDetails,
    count: signalsWithDetails.length,
  });
}