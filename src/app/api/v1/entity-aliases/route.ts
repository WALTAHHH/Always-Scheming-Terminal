import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Public endpoint — returns all alias→canonical_name mappings for client-side
 * company tag normalization. No auth required (data is non-sensitive).
 * Used by Feed.tsx to deduplicate company tag variants in the filter dropdown.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("entity_aliases")
    .select("alias, entities!inner(canonical_name)");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build flat alias → canonical_name map
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canonical = (row as any).entities?.canonical_name;
    if (canonical) map[row.alias.toLowerCase()] = canonical;
  }

  return NextResponse.json({ aliases: map });
}
