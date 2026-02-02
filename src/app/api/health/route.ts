import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Health thresholds (in hours) — tuned for daily ingestion
const HEALTHY_HOURS = 26; // ~1 day + buffer
const STALE_HOURS = 50; // ~2 days
// Anything beyond STALE_HOURS = dead

export async function GET() {
  const supabase = getSupabase();

  // Get all active sources with health info
  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select("id, name, active, last_fetched_at, last_error, consecutive_errors, last_success_at")
    .eq("active", true);

  if (srcErr) {
    return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }

  // Get last 24h of ingestion logs
  const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: recentLogs } = await supabase
    .from("ingestion_logs")
    .select("*")
    .gte("started_at", oneDayAgo)
    .order("started_at", { ascending: false });

  // Get the most recent run timestamp
  const { data: lastRun } = await supabase
    .from("ingestion_logs")
    .select("started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  const now = Date.now();

  const healthy: string[] = [];
  const stale: string[] = [];
  const dead: string[] = [];
  const erroring: { name: string; consecutive_errors: number; last_error: string }[] = [];

  for (const s of sources || []) {
    const hoursSince = s.last_fetched_at
      ? (now - new Date(s.last_fetched_at).getTime()) / 3600000
      : Infinity;

    if (hoursSince < HEALTHY_HOURS) {
      healthy.push(s.name);
    } else if (hoursSince < STALE_HOURS) {
      stale.push(s.name);
    } else {
      dead.push(s.name);
    }

    if (s.consecutive_errors > 0) {
      erroring.push({
        name: s.name,
        consecutive_errors: s.consecutive_errors,
        last_error: s.last_error || "unknown",
      });
    }
  }

  // Overall status
  const totalActive = sources?.length || 0;
  let status: "healthy" | "degraded" | "unhealthy";
  if (dead.length === 0 && erroring.length === 0) {
    status = "healthy";
  } else if (dead.length > totalActive * 0.5 || erroring.length > totalActive * 0.5) {
    status = "unhealthy";
  } else {
    status = "degraded";
  }

  // Recent run stats
  const recentErrors = (recentLogs || []).filter((l) => !l.success);
  const recentSuccess = (recentLogs || []).filter((l) => l.success);
  const totalFetched = (recentLogs || []).reduce((sum, l) => sum + (l.fetched || 0), 0);
  const totalInserted = (recentLogs || []).reduce((sum, l) => sum + (l.inserted || 0), 0);

  return NextResponse.json({
    status,
    lastRun: lastRun?.started_at || null,
    sources: {
      total: totalActive,
      healthy: healthy.length,
      stale: stale.length,
      dead: dead.length,
    },
    errors: {
      sourcesWithErrors: erroring.length,
      details: erroring,
    },
    last24h: {
      runs: (recentLogs || []).length,
      successes: recentSuccess.length,
      failures: recentErrors.length,
      fetched: totalFetched,
      inserted: totalInserted,
    },
    deadSources: dead,
    staleSources: stale,
  });
}
