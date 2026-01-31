import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const offset = Number(searchParams.get("offset")) || 0;
  const source = searchParams.get("source");
  const search = searchParams.get("q");

  const supabase = createServerClient();

  let query = supabase
    .from("items")
    .select("*, sources(name, url, source_type)", { count: "exact" })
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // Filter by source name
  if (source) {
    query = query.eq("sources.name", source);
  }

  // Text search
  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data,
    total: count,
    limit,
    offset,
  });
}
