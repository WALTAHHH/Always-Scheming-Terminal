import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";
import { createServerClient } from "@/lib/supabase";
import { isValidUuid } from "@/lib/entity-validation";

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
 *
 * `entity_id` is validated as a UUID and, on POST, checked for existence in
 * `entities` so that a malformed/foreign id surfaces as a 404 instead of a
 * Postgres FK 500.
 *
 * Visibility rule (deliberate, see AST card t_7a718c60): the follow gate is
 * "can the drawer show this entity?", NOT "is `entities.is_public` true". The
 * drawer is fed by `/api/v1/entities?alias=…`, which selects through the
 * service-role client and applies **no** `is_public` filter, so an entity with
 * `is_public = false/null` (or an entity hidden from the auth-scoped client by
 * RLS) was rendered with a Watch button that could only ever 404 — the exact
 * Take-Two regression. The existence probe below therefore uses the same
 * service-role client as the drawer's data source. It reads a single `id` for
 * an id the caller already holds and returns nothing else, so it reveals no
 * entity data the public `/api/v1/entities` endpoint does not already serve.
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

  // Reject anything that is not a UUID before it reaches a query: a malformed
  // id would otherwise blow up as a Postgres uuid-cast error → 500.
  if (!isValidUuid(entityId)) {
    return NextResponse.json(
      { error: "entity_id must be a valid UUID" },
      { status: 400 }
    );
  }

  // Existence gate: the caller may follow any entity the drawer can render.
  // This runs on the service-role client — the same client the drawer's
  // `/api/v1/entities` data source uses — so the gate can never disagree with
  // what the UI showed (no `is_public` filter, no dependence on entities RLS).
  const { data: entity, error: entityError } = await createServerClient()
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .maybeSingle();

  if (entityError) {
    return NextResponse.json(
      { error: "Failed to verify entity", code: "entity_verify_failed" },
      { status: 500 }
    );
  }

  if (!entity) {
    // Only a genuinely absent row 404s: the id came from the drawer, so a
    // missing row means the entity was deleted (or the caller sent a foreign
    // id from another environment).
    return NextResponse.json(
      { error: "Entity not found", code: "entity_not_found" },
      { status: 404 }
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

  // Delete is idempotent, so no existence check is needed — but a malformed id
  // must still be rejected up front (Postgres would 500 on the uuid cast).
  if (!isValidUuid(entityId)) {
    return NextResponse.json(
      { error: "entity_id must be a valid UUID" },
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
