import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/companies — returns company tag counts from item_tags.
 * Used for the company filter dropdown in the UI.
 */
export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("item_tags")
    .select("value")
    .eq("dimension", "company");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate counts
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.value] = (counts[row.value] || 0) + 1;
  }

  // Sort by count descending
  const companies = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({ companies });
}
