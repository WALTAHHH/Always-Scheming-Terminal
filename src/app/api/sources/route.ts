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
  last_error: string | null;
  consecutive_errors: number;
  last_success_at: string | null;
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

  // Get article counts per source — use per-source COUNT queries to avoid
  // PostgREST's 1000-row default cap on the content table.
  const sourceIds = (sources || []).map((s) => s.id);
  const articleCounts: Record<string, number> = {};
  const latestArticle: Record<string, string> = {};

  // Batch: one count query per source (small N — typically 20-30 sources)
  await Promise.all(
    sourceIds.map(async (sid) => {
      const { count } = await supabase
        .from("content")
        .select("*", { count: "exact", head: true })
        .eq("source_id", sid);
      if (count) articleCounts[sid] = count;
    })
  );

  // Latest published_at per source — use a single ordered query per source
  await Promise.all(
    sourceIds.map(async (sid) => {
      const { data } = await supabase
        .from("content")
        .select("published_at")
        .eq("source_id", sid)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (data?.published_at) latestArticle[sid] = data.published_at;
    })
  );

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
  type AllowedKey = "name" | "url" | "feed_url" | "source_type" | "active";
  const allowed: AllowedKey[] = ["name", "url", "feed_url", "source_type", "active"];
  const safeUpdates: Partial<Record<AllowedKey, string | boolean>> = {};
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key];
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

  // Delete related items first (foreign key constraint)
  const { error: itemsError } = await supabase
    .from("content")
    .delete()
    .eq("source_id", id);

  if (itemsError) {
    return NextResponse.json({ error: `Failed to delete articles: ${itemsError.message}` }, { status: 500 });
  }

  const { error } = await supabase.from("sources").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
