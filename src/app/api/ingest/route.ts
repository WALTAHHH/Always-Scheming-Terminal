import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, require it via Authorization header.
  // This secures both external cron jobs AND direct API calls.
  // The admin UI (same-origin) must also send the header — set NEXT_PUBLIC_CRON_SECRET
  // or use the admin page which reads it from the server environment.
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await ingestAll();
    const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const errors = results.filter((r) => r.errors.length > 0);

    return NextResponse.json({
      ok: true,
      summary: {
        sources: results.length,
        fetched: totalFetched,
        inserted: totalInserted,
        errors: errors.length,
      },
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Ingestion failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Also support GET for easy testing
export async function GET(req: NextRequest) {
  return POST(req);
}
