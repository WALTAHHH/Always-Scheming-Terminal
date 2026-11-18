import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-server";
import { rateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import type { FeedItem } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Session-authenticated feed endpoint for the LiveFeed client.
 *
 * This mirrors the server-component query in `src/app/page.tsx` (same columns,
 * same `sources.active = true` gate, same newest-first ordering) so the client
 * poll ("new items" banner) and infinite scroll stay consistent with the
 * initial server-rendered page.
 *
 * Cursors (mutually exclusive in practice):
 *   - `since=<ISO>`  → items strictly newer than the cursor (poll for new items)
 *   - `before=<ISO>` → items strictly older than the cursor (load more)
 *
 * Replaces the deleted `/api/items` route (removed in #27); that fetch was
 * 404ing every poll cycle.
 *
 * AUTH: the feed pages themselves sit behind the invite-only login wall
 * (`/` redirects unauthenticated users to `/auth/login`) and `src/middleware.ts`
 * deliberately skips `/api/*`, so every route under `/api/` owns its own auth.
 * This endpoint previously had none: it read the whole `content` table (with
 * joined source fields) on the service-role client for any anonymous caller.
 * It now requires a valid session up front — the same pattern as
 * `src/app/api/v1/watchlist/route.ts` — and returns `401 {error:"Unauthorized"}`
 * otherwise. The data query itself still runs on the service-role client so the
 * row/column shape stays identical to the server-rendered page; the session gate
 * is the access control, not RLS on this path.
 */
export async function GET(request: Request) {
  // 1. Session gate — must come before any data access.
  const authClient = await createAuthServerClient();
  const {
    data: { session },
  } = await authClient.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit (per IP, unchanged).
  const clientIP = getClientIP(request);
  const limitResult = rateLimit(`feed:${clientIP}`, RATE_LIMITS.public);
  if (!limitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((limitResult.resetTime - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsedLimit = Number(searchParams.get("limit"));
  const limit = Math.min(
    Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const since = searchParams.get("since"); // newer-than cursor
  const before = searchParams.get("before"); // older-than cursor

  const supabase = createServerClient();

  // Fetch limit+1 to detect whether another page exists.
  let query = supabase
    .from("content")
    .select("*, sources!inner(name, url, source_type, active)")
    .eq("sources.active", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);

  if (since) query = query.gt("published_at", since);
  if (before) query = query.lt("published_at", before);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as unknown as FeedItem[]) ?? [];
  const hasMore = rows.length > limit;

  return NextResponse.json({
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
  });
}
