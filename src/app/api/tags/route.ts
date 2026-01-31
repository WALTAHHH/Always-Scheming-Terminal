import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Get all unique tags grouped by dimension
  const { data, error } = await supabase
    .from("item_tags")
    .select("dimension, value") as { data: { dimension: string; value: string }[] | null; error: any };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by dimension and count occurrences
  const tagMap: Record<string, Record<string, number>> = {};
  for (const row of data || []) {
    if (!tagMap[row.dimension]) tagMap[row.dimension] = {};
    tagMap[row.dimension][row.value] = (tagMap[row.dimension][row.value] || 0) + 1;
  }

  // Sort each dimension's values by count (desc)
  const tags: Record<string, { value: string; count: number }[]> = {};
  for (const [dim, values] of Object.entries(tagMap)) {
    tags[dim] = Object.entries(values)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  return NextResponse.json({ tags });
}
