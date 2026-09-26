import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function validateEmail(email: string): boolean {
  const re = /^[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}$/;
  return re.test(email);
}

export async function GET(req: NextRequest) {
  // Auth check via session
  const supabase = await createAuthServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role client for queries
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

    return NextResponse.json({ emails: emails || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("GET /api/admin/invites error:", msg, error);
    return NextResponse.json(
      { error: "Failed to fetch allowed emails", detail: msg },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Auth check via session
  const supabase = await createAuthServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Use service role client for insert
    const serviceClient = getServiceRoleClient();

    // Check for duplicate
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

    // Insert new email
    const { data: newRow, error: insertError } = await serviceClient
      .from("allowed_emails")
      .insert({ email: email.trim() })
      .select("id, email, created_at")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    return NextResponse.json(newRow, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("POST /api/admin/invites error:", msg, error);
    return NextResponse.json(
      { error: "Failed to add email to allowlist", detail: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  // Auth check via session
  const supabase = await createAuthServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email");

  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "Missing email query parameter" },
      { status: 400 }
    );
  }

  // Use service role client for delete
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
      { error: "Failed to delete email from allowlist", detail: msg },
      { status: 500 }
    );
  }
}