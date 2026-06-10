import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { requireApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data || [],
    count: data?.length || 0,
  });
}
