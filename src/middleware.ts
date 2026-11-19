import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectTarget } from "@/lib/safe-redirect";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes (they have their own auth via api-auth.ts)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip discovery paths (robots.txt, llms.txt, .well-known/mcp.json, openapi.json)
  const discoveryPaths = ['/robots.txt', '/llms.txt', '/.well-known/mcp.json', '/openapi.json'];
  if (discoveryPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Public path: one-click unsubscribe (RFC 8058 List-Unsubscribe GET/POST from
  // mail clients and logged-out recipients). Must bypass the session check below.
  if (pathname === "/unsubscribe") {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes: everything except /auth/*
  if (!pathname.startsWith("/auth/") && !user) {
    const url = request.nextUrl.clone();
    // Preserve the deep link the visitor was trying to reach (path + query,
    // e.g. `/?company=Acme%20Games` from a weekly-digest email) so the login
    // page can return them to it after sign-in. The value is validated by the
    // same shared guard the login page uses before it is echoed back, so a
    // crafted path can never smuggle a cross-origin target into `next`.
    const next = safeRedirectTarget(
      `${pathname}${request.nextUrl.search}`,
      request.nextUrl.origin
    );
    url.pathname = "/auth/login";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // If user is logged in and trying to access /auth/login, redirect to home
  if (pathname === "/auth/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
