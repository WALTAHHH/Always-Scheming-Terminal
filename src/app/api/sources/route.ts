import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface SourceRow {
  id: string;
  name: string;
  url: string;
  feed_url: string;
  source_type: string;
  active: boolean;
  last_fetched_at: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = getSupabase();

  // Get sources
  const { data: sources, error } = await supabase
    .from("sources")
    .select("*")
    .order("name") as { data: SourceRow[] | null; error: any };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get article counts per source
  const { data: countData } = await supabase
    .from("items")
    .select("source_id") as { data: { source_id: string | null }[] | null; error: any };

  const articleCounts: Record<string, number> = {};
  for (const row of countData || []) {
    if (row.source_id) {
      articleCounts[row.source_id] = (articleCounts[row.source_id] || 0) + 1;
    }
  }

  // Get latest article date per source
  const { data: latestData } = await supabase
    .from("items")
    .select("source_id, published_at")
    .order("published_at", { ascending: false, nullsFirst: false }) as {
    data: { source_id: string | null; published_at: string | null }[] | null;
    error: any;
  };

  const latestArticle: Record<string, string> = {};
  for (const row of latestData || []) {
    if (row.source_id && row.published_at && !latestArticle[row.source_id]) {
      latestArticle[row.source_id] = row.published_at;
    }
  }

  const enriched = (sources || []).map((s) => ({
    ...s,
    article_count: articleCounts[s.id] || 0,
    latest_article_at: latestArticle[s.id] || null,
  }));

  return NextResponse.json({ sources: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();

  const { name, url, feed_url, source_type } = body;
  if (!name || !feed_url || !source_type) {
    return NextResponse.json(
      { error: "name, feed_url, and source_type are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("sources")
    .insert([{ name, url: url || feed_url, feed_url, source_type, active: true }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Only allow safe fields
  const allowed = ["name", "url", "feed_url", "source_type", "active"];
  const safeUpdates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = (updates as any)[key];
  }

  const { data, error } = await supabase
    .from("sources")
    .update(safeUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ source: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("sources").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
