import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * PATCH /api/v1/alerts/[id] — mark a single alert read (spec §3.5 / §5.3).
 *
 * Body is optional: `{ "read": false }` flips the row back to unread.
 * Ownership is enforced two ways: the explicit `user_id` filter and the
 * `alert_events` RLS UPDATE policy. A row that is not the caller's (or does
 * not exist) returns 404 rather than leaking existence.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return json({ error: "Invalid alert id" }, 400);
  }

  const supabase = await createAuthServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const read = body?.read !== false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("alert_events")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, read_at")
    .maybeSingle();

  if (error) {
    console.error("[alerts] mark-read failed:", error);
    return json({ error: "Failed to update alert" }, 500);
  }

  if (!data) {
    return json({ error: "Alert not found" }, 404);
  }

  return json({ id: data.id, read_at: data.read_at });
}
