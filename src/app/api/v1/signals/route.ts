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
  
  const signalType = searchParams.get("signal_type");
  const itemId = searchParams.get("item_id");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const cursor = searchParams.get("cursor");

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  let query = supabase
    .from("signals")
    .select(`
      id,
      item_id,
      signal_type,
      summary,
      investment_relevance_score,
      created_at,
      content (id, title, url, published_at)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (signalType) {
    query = query.eq("signal_type", signalType);
  }

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextCursor = data && data.length === limit ? (data[data.length - 1] as any).created_at : null;

  return NextResponse.json({
    data: data || [],
    count: data?.length || 0,
    next_cursor: nextCursor,
  });
}
