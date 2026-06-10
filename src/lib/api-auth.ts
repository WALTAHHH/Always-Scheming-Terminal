import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Validate Bearer token from Authorization header against api_keys table.
 * Returns { ok: true, keyId, owner } on success, or a NextResponse 401/500 on failure.
 * 
 * Usage in route handlers:
 *   const auth = await requireApiKey(request);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.owner, auth.keyId are available
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

  // SHA-256 via Node crypto
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("id, owner, scopes, rate_limit_rpm")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single() as unknown as { data: { id: string; owner: string; scopes: string[]; rate_limit_rpm: number } | null; error: unknown };

  if (error || !apiKey) {
    return NextResponse.json(
      { error: "Invalid or revoked API key" },
      { status: 401 }
    );
  }

  // Fire-and-forget last_used_at
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq("id", apiKey.id)
    .then(() => {});

  return { ok: true, keyId: apiKey.id, owner: apiKey.owner };
}
