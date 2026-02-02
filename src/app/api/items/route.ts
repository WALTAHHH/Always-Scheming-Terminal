import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const offset = Number(searchParams.get("offset")) || 0;
  const source = searchParams.get("source");
  const search = searchParams.get("q");
  const company = searchParams.get("company");
  const before = searchParams.get("before"); // cursor: published_at ISO timestamp

  const supabase = createServerClient();

  let query = supabase
    .from("items")
    .select("*, sources!inner(name, url, source_type, active)", { count: "exact" })
    .eq("sources.active", true)
    .order("published_at", { ascending: false, nullsFirst: false });

  // Cursor-based pagination: fetch items older than this timestamp
  if (before) {
    query = query.lt("published_at", before);
  }

  query = query.range(offset, offset + limit - 1);

  // Filter by source name
  if (source) {
    query = query.eq("sources.name", source);
  }

  // Text search
  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  // Company filter — uses jsonb containment on tags.company array
  if (company) {
    query = query.contains("tags", { company: [company] });
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data || [];
  const hasMore = items.length === limit;

  return NextResponse.json({
    items,
    total: count,
    limit,
    offset,
    hasMore,
  });
}
