import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const alias = searchParams.get('alias');
  // Skip auth for internal alias lookups (same-origin calls from CompanyDrawer)
  if (!alias) {
    const auth = await requireApiKey(request);
    if (auth instanceof NextResponse) return auth;
  }

  const entityType = searchParams.get("entity_type");
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const cursor = searchParams.get("cursor");

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // ── Alias lookup: find single entity by canonical name or alias ──
  if (alias) {
    // First try canonical_name exact match
    const { data: byName } = await supabase
      .from("entities")
      .select("id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, description, ir_url, sec_url, segment, market_cap_b, entity_aliases(alias, alias_type)")
      .ilike("canonical_name", alias)
      .limit(1)
      .single();

    if (byName) {
      return NextResponse.json({ data: byName });
    }

    // Fall back to alias table
    const { data: byAlias } = await supabase
      .from("entity_aliases")
      .select("entity_id, entities(id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, description, ir_url, sec_url, segment, market_cap_b, entity_aliases(alias, alias_type))")
      .ilike("alias", alias)
      .limit(1)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aliasEntity = (byAlias as any)?.entities;
    if (aliasEntity) {
      return NextResponse.json({ data: aliasEntity });
    }

    return NextResponse.json({ data: null });
  }

  // ── List all entities (paginated) ──
  let query = supabase
    .from("entities")
    .select("id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, description, ir_url, sec_url, segment, market_cap_b, entity_aliases(alias, alias_type)")
    .order("canonical_name", { ascending: true })
    .limit(limit);

  if (cursor) query = query.gt("canonical_name", cursor);
  if (entityType) query = query.eq("entity_type", entityType);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextCursor =
    data && data.length === limit
      ? (data[data.length - 1] as { canonical_name: string }).canonical_name
      : null;

  return NextResponse.json({
    data: data || [],
    count: data?.length || 0,
    next_cursor: nextCursor,
  });
}
