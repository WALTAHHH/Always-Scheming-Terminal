import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * GET /api/v1/alerts
 *
 * Alert inbox for the signed-in user (spec §3.5). `read_at IS NULL` = unread.
 *
 * Modes:
 *   ?unread=1                      → { unread: n }   (cheap badge count only)
 *   ?unread_only=1                 → unread alerts list
 *   (default)                      → all alerts, newest first, plus unread count
 *   &limit=N                       → page size (default 50, max 200)
 *   &cursor=<created_at ISO string> → keyset pagination, returns rows older than cursor
 *
 * Response: { alerts: AlertRow[], unread: n, count: n, next_cursor: string | null }
 * AlertRow embeds the signal summary/url and the watched entity name when present.
 */
export async function GET(request: NextRequest) {
  const supabase = await createAuthServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get("unread") === "1";
  const unreadOnly = searchParams.get("unread_only") === "1";
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = searchParams.get("cursor");

  // Unread badge count — always cheap, no row payload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: unread, error: countError } = await (supabase as any)
    .from("alert_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (countError) {
    console.error("[alerts] unread count failed:", countError);
    return json({ error: "Failed to load alerts" }, 500);
  }

  if (countOnly) {
    return json({ unread: unread ?? 0 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("alert_events")
    .select(
      `id, signal_id, watchlist_id, entity_id, signal_type, score,
       created_at, read_at, email_sent_at,
       signal:signals (
         id, summary, signal_type, investment_relevance_score, created_at,
         content:content_id ( title, url, published_at )
       ),
       entity:entities ( id, canonical_name, ticker, entity_type )`
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.is("read_at", null);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) {
    console.error("[alerts] list failed:", error);
    return json({ error: "Failed to load alerts" }, 500);
  }

  const alerts = (data ?? []) as unknown[];
  const last = alerts[alerts.length - 1] as { created_at?: string | null } | undefined;

  return json({
    alerts,
    unread: unread ?? 0,
    count: alerts.length,
    next_cursor: alerts.length === limit && last?.created_at ? last.created_at : null,
  });
}

/**
 * PATCH /api/v1/alerts
 *
 * Bulk mark-read used by the alerts popover (spec §5.3). Body:
 *   { "ids": ["<uuid>", ...] }  → mark those alerts read
 *   { "all": true }             → mark every unread alert read
 *   { "read": false }           → optional; mark unread instead of read
 *
 * Only the caller's own rows are touched (user_id filter + RLS).
 * Response: { updated: n }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createAuthServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const markAll = body.all === true;
  const read = body.read !== false;
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === "string" && UUID_RE.test(id))
    : [];

  if (!markAll && ids.length === 0) {
    return json({ error: "Provide ids[] or all: true" }, 400);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("alert_events")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .select("id");

  if (!markAll) query = query.in("id", ids);
  else query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) {
    console.error("[alerts] bulk mark-read failed:", error);
    return json({ error: "Failed to update alerts" }, 500);
  }

  return json({ updated: ((data ?? []) as unknown[]).length });
}
