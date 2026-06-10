import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  
  const sourceId = searchParams.get("source_id");
  const signalType = searchParams.get("signal_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const cursor = searchParams.get("cursor");

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  let query = supabase
    .from("content")
    .select(`
      id,
      title,
      url,
      body,
      author,
      published_at,
      ingested_at,
      source_id,
      sources (name, url, source_type),
      content_tags (dimension, value, entity_id),
      signals (id, signal_type, summary, investment_relevance_score, created_at)
    `)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("published_at", cursor);
  }

  if (sourceId) {
    query = query.eq("source_id", sourceId);
  }

  if (dateFrom) {
    query = query.gte("published_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("published_at", dateTo);
  }

  // Filter by signal_type if provided (requires join)
  if (signalType) {
    query = query.eq("signals.signal_type", signalType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextCursor = data && data.length === limit ? (data[data.length - 1] as any).published_at : null;

  return NextResponse.json({
    data: data || [],
    count: data?.length || 0,
    next_cursor: nextCursor,
  });
}
