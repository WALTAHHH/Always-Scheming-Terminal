import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("signals")
    .select(`
      id, signal_type, summary, investment_relevance_score, created_at,
      content:content_id (
        id, title, url, published_at,
        content_tags (value, dimension, entity_id)
      )
    `)
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const companyTags = (d.content?.content_tags || [])
    .filter((t: any) => t.dimension === "company" && t.entity_id !== null)
    .map((t: any) => t.value);

  return NextResponse.json({
    id: d.id,
    signal_type: d.signal_type,
    summary: d.summary,
    investment_relevance_score: d.investment_relevance_score,
    companies: companyTags,
    title: d.content?.title || "",
    url: d.content?.url || "",
    published_at: d.content?.published_at || null,
    created_at: d.created_at,
  });
}