import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

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
