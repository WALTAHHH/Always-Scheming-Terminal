import { NextRequest, NextResponse } from "next/server";
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

/**
 * Admin-only endpoint — creates a new entity alias.
 * Body: { alias: string, canonical_name: string }
 * Looks up the entity by canonical_name, then inserts the alias.
 * Used by the pipeline dashboard "add alias" button on unresolved tags.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const body = await req.json().catch(() => null);
  if (!body?.alias || !body?.canonical_name) {
    return NextResponse.json(
      { error: "alias and canonical_name are required" },
      { status: 400 }
    );
  }

  const alias = String(body.alias).trim();
  const canonical_name = String(body.canonical_name).trim();

  // Look up entity by canonical_name (case-insensitive)
  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("id, canonical_name")
    .ilike("canonical_name", canonical_name)
    .maybeSingle();

  if (entityError) {
    return NextResponse.json({ error: entityError.message }, { status: 500 });
  }
  if (!entity) {
    return NextResponse.json(
      { error: `No entity found matching "${canonical_name}"` },
      { status: 404 }
    );
  }

  // Insert alias
  const { error: insertError } = await supabase
    .from("entity_aliases")
    .insert({ entity_id: entity.id, alias, alias_type: "common" });

  if (insertError) {
    // Unique constraint violation
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: `Alias "${alias}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alias, entity: entity.canonical_name });
}
