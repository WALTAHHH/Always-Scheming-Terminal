import { requireAdmin } from '@/lib/admin-auth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Forward to /api/ingest with the server-side secret
  const cronSecret = process.env.CRON_SECRET;
  const ingestUrl = new URL('/api/ingest', process.env.NEXT_PUBLIC_SITE_URL || 'https://terminal.always-scheming.com').toString();

  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
