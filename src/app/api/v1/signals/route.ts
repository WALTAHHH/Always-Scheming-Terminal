import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // Query signals first
  const { data: signalsData, error: signalsError } = await supabase
    .from("signals")
    .select("*")
    .gte("investment_relevance_score", 0.5)
    .order("created_at", { ascending: false })
    .limit(10);

  if (signalsError) {
    return NextResponse.json({ error: signalsError.message }, { status: 500 });
  }

  // Get content and company tags for each signal
  const signalsWithDetails = await Promise.all(
    (signalsData || []).map(async (signal) => {
      // Get content details
      const { data: content } = await supabase
        .from("content")
        .select("id, title, url, published_at")
        .eq("id", signal.item_id)
        .single();

      // Get company tags for this content
      const { data: tags } = await supabase
        .from("content_tags")
        .select("value")
        .eq("content_id", signal.item_id)
        .eq("dimension", "company");

      return {
        id: signal.id,
        signal_type: signal.signal_type,
        summary: signal.summary,
        investment_relevance_score: signal.investment_relevance_score,
        companies: tags?.map((t) => t.value) || [],
        title: content?.title || "",
        url: content?.url || "",
        published_at: content?.published_at || null,
        created_at: signal.created_at,
      };
    })
  );

  return NextResponse.json({
    signals: signalsWithDetails,
    count: signalsWithDetails.length,
  });
}
