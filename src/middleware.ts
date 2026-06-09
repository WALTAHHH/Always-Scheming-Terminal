import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./lib/database.types";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/v1/* routes (exclude /api/v1/health)
  if (!pathname.startsWith("/api/v1/") || pathname === "/api/v1/health") {
    return NextResponse.next();
  }

  // Extract API key from Authorization header (Bearer token format)
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 }
    );
  }

  const rawKey = authHeader.substring(7); // Remove "Bearer " prefix
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  // Verify key against database
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !apiKey) {
    return NextResponse.json(
      { error: "Invalid or revoked API key" },
      { status: 401 }
    );
  }

  // Update last_used_at timestamp (fire-and-forget - ignore type issues)
  void (async () => {
    try {
      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() } as never)
        .eq("id", (apiKey as any).id);
    } catch (err) {
      console.error("Failed to update last_used_at:", err);
    }
  })();

  // Pass through with key metadata in headers (for rate limiting in route handlers)
  const response = NextResponse.next();
  response.headers.set("x-api-key-id", (apiKey as any).id);
  response.headers.set("x-api-key-owner", (apiKey as any).owner);
  response.headers.set("x-api-key-rate-limit", (apiKey as any).rate_limit_rpm.toString());

  return response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
