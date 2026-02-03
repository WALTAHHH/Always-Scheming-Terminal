import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: NextRequest) {
  // Auth: require valid Bearer token only when an Authorization header is
  // present (external cron jobs).  Same-origin browser requests (e.g. the
  // admin "Fetch All" button) won't send a header and are allowed through.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
