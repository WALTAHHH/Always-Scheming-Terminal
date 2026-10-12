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

function validateEmail(email: string): boolean {
  const re = /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/;
  return re.test(email);
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const serviceClient = getServiceRoleClient();

  try {
    const { data: emails, error } = await serviceClient
      .from("allowed_emails")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch allowed emails:", error);
      throw error;
    }

    // Fetch all auth users to derive status
    const { data: { users }, error: usersError } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) {
      console.error("Failed to fetch auth users:", usersError);
      // fallback to empty map
    }
    const userMap = new Map((users || []).map(u => [u.email, u]));

    const enriched = (emails || []).map(row => {
      const user = userMap.get(row.email);
      let status: "activated" | "invited" | "pending" = "pending";
      if (user) {
        status = user.confirmed_at ? "activated" : "invited";
      }
      return { ...row, status };
    });

    return NextResponse.json({ invites: enriched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("GET /api/admin/invites error:", msg, error);
    return NextResponse.json(
      { error: "Failed to fetch allowed emails" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid email field" },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const serviceClient = getServiceRoleClient();

    const { data: existing, error: checkError } = await serviceClient
      .from("allowed_emails")
      .select("id")
      .eq("email", email.trim())
      .maybeSingle();

    if (checkError) {
      console.error("Duplicate check error:", checkError);
      throw checkError;
    }

    if (existing) {
      return NextResponse.json(
        { error: "Email already exists in allowlist" },
        { status: 409 }
      );
    }

    const { data: newRow, error: insertError } = await serviceClient
      .from("allowed_emails")
      .insert({ email: email.trim() })
      .select("id, email, created_at")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    // Send invite email via Supabase Auth
    try {
      await serviceClient.auth.admin.inviteUserByEmail(email.trim(), {
        redirectTo: 'https://terminal.always-scheming.com/auth/login',
      });
      console.log(`Invite sent to ${email}`);
    } catch (error) {
      console.error('Failed to send invite email:', error);
      // Do not fail the request; allowlist addition succeeded
    }

    return NextResponse.json(newRow, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("POST /api/admin/invites error:", msg, error);
    return NextResponse.json(
      { error: "Failed to add email to allowlist" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const email = url.searchParams.get("email");

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "Missing email query parameter" },
      { status: 400 }
    );
  }

  const serviceClient = getServiceRoleClient();

  try {
    const { data: deleted, error } = await serviceClient
      .from("allowed_emails")
      .delete()
      .eq("email", email.trim())
      .select("id, email, created_at")
      .maybeSingle();

    if (error) {
      console.error("Delete error:", error);
      throw error;
    }

    if (!deleted) {
      return NextResponse.json(
        { error: "Email not found in allowlist" },
        { status: 404 }
      );
    }

    return NextResponse.json(deleted);
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("DELETE /api/admin/invites error:", msg, error);
    return NextResponse.json(
      { error: "Failed to delete email from allowlist" },
      { status: 500 }
    );
  }
}
