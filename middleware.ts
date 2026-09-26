import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Check for admin cookie
    const adminToken = request.cookies.get('ast-admin')?.value;
    
    // Check for ?secret=xyz in URL (sets cookie for future visits)
    const urlSecret = request.nextUrl.searchParams.get('secret');
    
    if (urlSecret && urlSecret === ADMIN_SECRET) {
      // Valid secret in URL - set cookie and redirect to clean URL
      const cleanUrl = new URL('/admin', request.url);
      const response = NextResponse.redirect(cleanUrl);
      response.cookies.set('ast-admin', 'true', { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
      return response;
    }
    
    if (adminToken !== 'true') {
      // No valid cookie - redirect to home
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (request.nextUrl.pathname === '/') {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/'],
};
