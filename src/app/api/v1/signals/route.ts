import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const minScore = parseFloat(searchParams.get("min_score") || "0.3");
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // Single query with JOINs
  const { data: signalsData, error: signalsError } = await supabase
    .from("signals")
    .select(`
      id, signal_type, summary, investment_relevance_score, created_at,
      content:item_id (
        id, title, url, published_at,
        content_tags (value, dimension, entity_id)
      )
    `)
    .gte("investment_relevance_score", minScore)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (signalsError) {
    return NextResponse.json({ error: signalsError.message }, { status: 500 });
  }

  // Map to existing response shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signalsWithDetails = ((signalsData || []) as any[]).map((signal) => {
    // Extract company tags where dimension = 'company' and entity_id is not null
    const companyTags = (signal.content?.content_tags || [])
      .filter((tag: any) => tag.dimension === "company" && tag.entity_id !== null)
      .map((tag: any) => tag.value);

    return {
      id: signal.id,
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

  return NextResponse.json({
    signals: signalsWithDetails,
    count: signalsWithDetails.length,
  });
}