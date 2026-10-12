import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const serviceClient = getServiceRoleClient();

  // Must be on allowlist
  const { data: existing } = await serviceClient
    .from("allowed_emails")
    .select("id")
    .eq("email", email.trim())
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Email not on allowlist" }, { status: 404 });
  }

  try {
    await serviceClient.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: "https://terminal.always-scheming.com/auth/login",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to resend invite";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}