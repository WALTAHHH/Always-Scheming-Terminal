import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
// Auth is cookie-based; never cache a per-user response.
export const dynamic = "force-dynamic";

/**
 * Per-user watchlist API (spec §2/§5).
 *
 *   GET    /api/v1/watchlist              → the caller's watched entities
 *   POST   /api/v1/watchlist {entity_id}  → follow an entity (idempotent)
 *   DELETE /api/v1/watchlist?entity_id=…  → unfollow an entity (idempotent)
 *
 * All verbs are session-authenticated. Row-level security on `watchlists`
 * (`auth.uid() = user_id`) is the second line of defence: the auth-scoped
 * client below can only ever read/write the caller's own rows.
 */

// The nested `entity:entities(...)` embed below is not reflected in the
// hand-maintained Database types, so the row shape is asserted locally.
type WatchlistRowWithEntity = {
  id: string;
  entity_id: string;
  created_at: string | null;
  entity: {
    id: string;
    canonical_name: string;
    ticker: string | null;
    exchange: string | null;
    entity_type: string;
    is_public: boolean | null;
  } | null;
};

const ENTITY_SELECT = "id, entity_id, created_at, entity:entities(id, canonical_name, ticker, exchange, entity_type, is_public)";

async function getAuthedClient() {
  const supabase = await createAuthServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) return null;
  return { supabase, userId: session.user.id };
}

export async function GET() {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("watchlists")
    .select(ENTITY_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as WatchlistRowWithEntity[];

  return NextResponse.json({
    data: rows,
    // Convenience list for the CompanyDrawer star state (§5.1).
    entity_ids: rows.map((r) => r.entity_id),
    count: rows.length,
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, userId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entityId = (body as { entity_id?: unknown } | null)?.entity_id;
  if (typeof entityId !== "string" || entityId.trim() === "") {
    return NextResponse.json(
      { error: "entity_id is required" },
      { status: 400 }
    );
  }

  // Idempotent follow: UNIQUE(user_id, entity_id) + ignoreDuplicates makes a
  // repeated watch a no-op rather than a 409.
  const { error } = await supabase
    .from("watchlists")
    .upsert(
      { user_id: userId, entity_id: entityId },
      { onConflict: "user_id,entity_id", ignoreDuplicates: true }
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, entity_id: entityId, watching: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, userId } = auth;

  const entityId = new URL(req.url).searchParams.get("entity_id");
  if (!entityId) {
    return NextResponse.json(
      { error: "entity_id query parameter is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("user_id", userId)
    .eq("entity_id", entityId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    );
  }

  // Idempotent: deleting something not present is still a success.
  return NextResponse.json({ ok: true, entity_id: entityId, watching: false });
}
