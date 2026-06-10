import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Edge-compatible middleware ──
// Next.js middleware always runs on Edge Runtime regardless of `runtime` config.
// supabase-js uses Node built-ins and crashes on Edge — use raw fetch instead.

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

  const rawKey = authHeader.substring(7);

  // SHA-256 hash via Web Crypto API (Edge-compatible)
  const encoded = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Verify key via Supabase REST API (raw fetch — no supabase-js)
  const res = await fetch(
    `${supabaseUrl}/rest/v1/api_keys?key_hash=eq.${keyHash}&revoked_at=is.null&select=id,owner,scopes,rate_limit_rpm`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

  const keys = await res.json() as Array<{
    id: string;
    owner: string;
    scopes: string[];
    rate_limit_rpm: number;
  }>;

  if (!keys || keys.length === 0) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const apiKey = keys[0];

  // Update last_used_at — fire-and-forget, don't await
  fetch(
    `${supabaseUrl}/rest/v1/api_keys?id=eq.${apiKey.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }
  ).catch(() => {}); // intentionally fire-and-forget

  // Pass key metadata downstream via request headers
  const response = NextResponse.next();
  response.headers.set("x-api-key-id", apiKey.id);
  response.headers.set("x-api-key-owner", apiKey.owner);
  response.headers.set("x-api-key-rate-limit", String(apiKey.rate_limit_rpm));

  return response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
