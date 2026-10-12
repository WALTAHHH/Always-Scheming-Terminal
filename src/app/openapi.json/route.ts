import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/v1/openapi.json', request.url), 308);
}

export async function HEAD(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/v1/openapi.json', request.url), 308);
}