import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { rateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import type { FeedItem } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Public feed endpoint for the LiveFeed client.
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
 */
export async function GET(request: Request) {
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
