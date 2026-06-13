import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";

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
    theme,
  } = body;

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
