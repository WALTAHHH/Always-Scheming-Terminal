import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";
import { createServerClient } from "@/lib/supabase";

const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Every existing theme tag value.
 *
 * Interests must be picked from the tag catalogue (no free text), so PATCH
 * validates the submitted array against these values. Mirrors the aggregation
 * used by GET /api/tags/themes: prefer the `theme_tag_counts()` RPC (migration
 * 021), else page through content_tags with `.range()` so we never stop at the
 * PostgREST 1000-row cap.
 */
async function loadThemeValues(client: AnyClient): Promise<string[]> {
  const values = new Set<string>();

  const rpc = await client.rpc("theme_tag_counts");
  if (!rpc?.error && Array.isArray(rpc?.data)) {
    for (const row of rpc.data as { value: string }[]) {
      if (row?.value) values.add(row.value);
    }
    return Array.from(values);
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("content_tags")
      .select("value")
      .eq("dimension", "theme")
      .order("value", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { value: string | null }[];
    for (const row of rows) if (row.value) values.add(row.value);
    if (rows.length < PAGE_SIZE) break;
  }
  return Array.from(values);
}

export async function GET(req: NextRequest) {
  const supabase = await createAuthServerClient();

  // Get the authenticated user
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch user profile and preferences
  const [profileResult, prefsResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("user_preferences")
      .select("*")
      .eq("user_id", session.user.id)
      .single(),
  ]);

  if (profileResult.error) {
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }

  // Preferences might not exist yet (create on first GET)
  let preferences = prefsResult.data;
  if (prefsResult.error && prefsResult.error.code === "PGRST116") {
    // Not found - create default preferences
    const { data: newPrefs, error: createError } = await (supabase as any)
      .from("user_preferences")
      .insert({ user_id: session.user.id })
      .select()
      .single();

    if (createError) {
      return NextResponse.json(
        { error: "Failed to create preferences" },
        { status: 500 }
      );
    }
    preferences = newPrefs;
  } else if (prefsResult.error) {
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profile: profileResult.data,
    preferences,
    email: session.user.email,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createAuthServerClient();

  // Get the authenticated user
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    display_name,
    interests,
    segments,
    notification_prefs,
    digest_frequency,
    watchlist_min_score,
    theme,
  } = body;

  // Interests must be chosen from the existing theme tag catalogue — free text
  // is no longer accepted from the picker. Validate against the catalogue plus
  // whatever is already saved for this user, so previously-saved "legacy"
  // interests (tags that have since disappeared from the visible catalogue)
  // survive a save instead of being rejected or silently dropped. Anything
  // failing both checks is rejected with 400 + the offending values.
  if (interests !== undefined) {
    if (
      !Array.isArray(interests) ||
      interests.some((interest: unknown) => typeof interest !== "string")
    ) {
      return NextResponse.json(
        { error: "interests must be an array of strings" },
        { status: 400 }
      );
    }

    const service = createServerClient();
    let allowed: Set<string>;
    try {
      const [existingThemes, storedResult] = await Promise.all([
        loadThemeValues(service as AnyClient),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("user_preferences")
          .select("interests")
          .eq("user_id", session.user.id)
          .maybeSingle(),
      ]);
      const stored: string[] = Array.isArray(storedResult?.data?.interests)
        ? storedResult.data.interests
        : [];
      allowed = new Set<string>([...existingThemes, ...stored]);
    } catch {
      return NextResponse.json(
        { error: "Failed to validate interests" },
        { status: 500 }
      );
    }

    const unknown = (interests as string[]).filter(
      (interest) => !allowed.has(interest)
    );
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: "Unknown interests", unknown },
        { status: 400 }
      );
    }
  }

  // Update profile if display_name is provided
  if (display_name !== undefined) {
    const { error: profileError } = await (supabase as any)
      .from("profiles")
      .update({ display_name, updated_at: new Date().toISOString() })
      .eq("id", session.user.id);

    if (profileError) {
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }
  }

  // Build preferences update object (only include provided fields)
  const prefsUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (interests !== undefined) prefsUpdate.interests = interests;
  if (segments !== undefined) prefsUpdate.segments = segments;
  if (notification_prefs !== undefined)
    prefsUpdate.notification_prefs = notification_prefs;
  if (digest_frequency !== undefined)
    prefsUpdate.digest_frequency = digest_frequency;
  // Watchlist alert threshold (spec §5.5 / §2.3). Typed numeric column gating
  // which followed-entity signals (signals.investment_relevance_score) qualify
  // for the weekly digest + in-app badge. Clamp to [0,1]; ignore non-numbers.
  if (watchlist_min_score !== undefined) {
    const n = Number(watchlist_min_score);
    if (Number.isFinite(n)) {
      prefsUpdate.watchlist_min_score = Math.min(1, Math.max(0, n));
    }
  }
  if (theme !== undefined) prefsUpdate.theme = theme;

  // Only update preferences if there are changes beyond updated_at
  if (Object.keys(prefsUpdate).length > 1) {
    const { error: prefsError } = await (supabase as any)
      .from("user_preferences")
      .update(prefsUpdate)
      .eq("user_id", session.user.id);

    if (prefsError) {
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
