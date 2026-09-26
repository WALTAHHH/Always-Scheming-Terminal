import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    const { error } = await supabase
      .from("allowed_emails" as any)
      .insert({ email, created_at: new Date().toISOString() });

    if (error) {
      console.warn("Failed to insert into allowed_emails:", error);
      // Still return success to keep UX smooth
      return NextResponse.json({ ok: true, warning: "Request recorded but not persisted" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("Request access endpoint error:", err);
    // Fallback success so UX isn't broken
    return NextResponse.json({ ok: true, warning: "Request received — we'll be in touch" });
  }
}