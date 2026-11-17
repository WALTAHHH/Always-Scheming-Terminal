import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  // Auth gate first: only signed-in users may enumerate the theme list.
  const authClient = await createAuthServerClient();

  // Get the authenticated user
  const {
    data: { session },
    error: sessionError,
  } = await authClient.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Query on the service-role client. `content_tags` is now RLS-scoped to
  // content reachable from a public entity (migration 020), but this endpoint
  // returns the *global* list of theme values for the filter UI, so an
  // authenticated read would silently drop themes that only appear on private
  // content. This stays server-only — SERVICE_ROLE never enters a client bundle.
  const supabase = createServerClient();

  // Query distinct theme values
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("content_tags")
    .select("value")
    .eq("dimension", "theme")
    .order("value", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch themes" },
      { status: 500 }
    );
  }

  // Extract unique values
  const themes = Array.from(new Set(data.map((row: { value: string }) => row.value)));

  return NextResponse.json({ themes });
}
