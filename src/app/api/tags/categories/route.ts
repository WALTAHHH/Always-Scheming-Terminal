import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from("content_tags")
      .select("value")
      .eq("dimension", "category")
      .not("value", "is", null)
      .order("value", { ascending: true });

    if (error) {
      console.error("[categories] Failed to fetch categories:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extract distinct values
    const distinctValues = Array.from(new Set(data.map((row) => row.value)));

    return NextResponse.json({
      categories: distinctValues,
    });
  } catch (err) {
    console.error("[categories] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}