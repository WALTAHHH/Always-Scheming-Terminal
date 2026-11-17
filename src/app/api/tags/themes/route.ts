import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

// The set of theme tags changes slowly (only when new content is ingested), so
// allow a light 5-minute cache instead of re-aggregating on every keystroke.
export const revalidate = 300;

type ThemeTag = { value: string; count: number };

const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Return every distinct theme tag with its usage count.
 *
 * Preferred path: the `theme_tag_counts()` aggregate RPC (migration 021), which
 * returns a handful of pre-aggregated rows and therefore can never hit the
 * PostgREST 1000-row response cap that the previous implementation silently
 * tripped (it selected every content_tags row and deduped in JS, so themes
 * after the first 1000 rows — ordered A→Z — were dropped entirely).
 *
 * Fallback path: if the RPC is missing (environment hasn't run 021 yet) page
 * through the raw rows with `.range()` loops and aggregate in memory. The loop
 * keeps going until a short page is returned, so it also defeats the cap.
 */
async function loadThemeCounts(client: AnyClient): Promise<ThemeTag[]> {
  // --- Preferred: aggregate RPC -------------------------------------------
  const rpc = await client.rpc("theme_tag_counts");
  if (!rpc?.error && Array.isArray(rpc?.data)) {
    return (rpc.data as { value: string; count: number | string }[])
      .filter((row) => typeof row.value === "string" && row.value.length > 0)
      .map((row) => ({ value: row.value, count: Number(row.count) || 0 }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }

  // --- Fallback: paginated scan -------------------------------------------
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("content_tags")
      .select("value")
      .eq("dimension", "theme")
      .order("value", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = (data ?? []) as { value: string | null }[];
    for (const row of rows) {
      if (!row.value) continue;
      counts.set(row.value, (counts.get(row.value) ?? 0) + 1);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export async function GET() {
  const supabase = await createAuthServerClient();

  // Get the authenticated user
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Service-role read after the session check (consistent with the RLS
    // tightening in PR #138): the tag catalogue is global, non-user data, and
    // the anon/auth-scoped client is subject to the content_tags read policy.
    const service = createServerClient();
    const tags = await loadThemeCounts(service as AnyClient);

    return NextResponse.json(
      {
        tags,
        // Convenience array of just the values, kept for backwards compatibility.
        themes: tags.map((tag) => tag.value),
        total: tags.length,
      },
      {
        headers: {
          // Private: the response is behind a session check, so don't let a
          // shared CDN cache it. 5 minutes mirrors the `revalidate` above.
          "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch themes" },
      { status: 500 }
    );
  }
}
