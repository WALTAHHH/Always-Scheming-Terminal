import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = req.nextUrl;

  // Optional: filter by source_id
  const sourceId = searchParams.get("source_id");
  // Default: last 7 days of logs
  const days = parseInt(searchParams.get("days") || "7", 10);
  const since = new Date(Date.now() - days * 24 * 3600000).toISOString();

  let query = supabase
    .from("ingestion_logs")
    .select("*")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(500);

  if (sourceId) {
    query = query.eq("source_id", sourceId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}
