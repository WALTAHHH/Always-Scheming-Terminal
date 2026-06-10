import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type ApiKeyRow = { id: string; owner: string; scopes: string[]; rate_limit_rpm: number };

/**
 * Validate Bearer token from Authorization header against api_keys table.
 * Returns { ok: true, keyId, owner } on success, or a NextResponse 401/503 on failure.
 */
export async function requireApiKey(
  request: Request
): Promise<{ ok: true; keyId: string; owner: string } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 }
    );
  }

  const rawKey = authHeader.substring(7);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  let apiKey: ApiKeyRow | null;
  try {
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, owner, scopes, rate_limit_rpm")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
    }
    apiKey = data as unknown as ApiKeyRow;
  } catch (e) {
    console.error("[api-auth] DB query failed:", e);
    return NextResponse.json({ error: "Auth service unavailable" }, { status: 503 });
  }

  // Fire-and-forget last_used_at (best effort)
  void (async () => {
    try {
      await createClient<Database>(supabaseUrl, supabaseKey)
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() } as never)
        .eq("id", apiKey!.id);
    } catch { /* ignore */ }
  })();

  return { ok: true, keyId: apiKey.id, owner: apiKey.owner };
}
