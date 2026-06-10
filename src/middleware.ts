import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth has been moved to individual route handlers (src/lib/api-auth.ts)
// because Next.js middleware always runs on Edge Runtime and supabase-js
// requires Node.js. Route handlers export `runtime = "nodejs"` and do
// the key check there instead.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: "/api/v1/:path*",
};
