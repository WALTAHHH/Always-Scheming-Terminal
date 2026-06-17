import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  // Auth check via session
  const supabase = await createAuthServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role client for queries
  const serviceClient = getServiceRoleClient();

  try {
    // 1. Total articles
    console.log("Pipeline query block 1: total articles");
    const { count: totalCount, error: totalError } = await serviceClient
      .from("content")
      .select("*", { count: "exact", head: true });

    if (totalError) {
      console.error("Pipeline query failed: total articles", totalError);
      throw totalError;
    }

    // 2. Articles with any tags
    console.log("Pipeline query block 2: articles with any tags");
    const { count: taggedCount, error: taggedError } = await serviceClient
      .from("content")
      .select("*", { count: "exact", head: true })
      .neq("tags", "{}")
      .not("tags", "is", null);

    if (taggedError) {
      console.error("Pipeline query failed: articles with any tags", taggedError);
      throw taggedError;
    }

    // 3. Tag counts by dimension - fetch all and group manually
    console.log("Pipeline query block 3: tag counts by dimension");
    const { data: allTags, error: tagsError } = await serviceClient
      .from("content_tags")
      .select("dimension");

    if (tagsError) {
      console.error("Pipeline query failed: tag counts by dimension", tagsError);
      throw tagsError;
    }

    const dimensionCounts: Record<string, number> = {};
    (allTags || []).forEach((row: { dimension: string }) => {
      dimensionCounts[row.dimension] = (dimensionCounts[row.dimension] || 0) + 1;
    });

    const tagsByDimension = Object.entries(dimensionCounts)
      .map(([dimension, count]) => ({ dimension, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Signals total + by type
    console.log("Pipeline query block 4: signals total + by type");
    const { data: allSignals, error: signalsError } = await serviceClient
      .from("signals")
      .select("signal_type");

    if (signalsError) {
      console.error("Pipeline query failed: signals total + by type", signalsError);
      throw signalsError;
    }

    const signalTypeCounts: Record<string, number> = {};
    (allSignals || []).forEach((row: { signal_type: string }) => {
      signalTypeCounts[row.signal_type] = (signalTypeCounts[row.signal_type] || 0) + 1;
    });

    const signalsByType = Object.entries(signalTypeCounts).map(
      ([signal_type, count]) => ({ signal_type, count })
    );

    // Last signal created
    console.log("Pipeline query block 5: last signal created");
    const { data: lastSignalData, error: lastSignalError } =
      await serviceClient
        .from("signals")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastSignalError && lastSignalError.code !== "PGRST116") {
      console.error("Pipeline query failed: last signal created", lastSignalError);
      throw lastSignalError;
    }

    // 5. Importance gate (importance_score column not yet migrated — stub zeros)
    const clearedCount = 0;
    const clearedNoSignal = 0;

    // 6. Entity resolution coverage
    console.log("Pipeline query block 6: entity resolution coverage");
    const { count: totalCompanyTags, error: totalCompanyError } =
      await serviceClient
        .from("content_tags")
        .select("*", { count: "exact", head: true })
        .eq("dimension", "company");

    if (totalCompanyError) {
      console.error("Pipeline query failed: total company tags", totalCompanyError);
      throw totalCompanyError;
    }

    const { count: resolvedCompanyTags, error: resolvedCompanyError } =
      await serviceClient
        .from("content_tags")
        .select("*", { count: "exact", head: true })
        .eq("dimension", "company")
        .not("entity_id", "is", null);

    if (resolvedCompanyError) {
      console.error("Pipeline query failed: resolved company tags", resolvedCompanyError);
      throw resolvedCompanyError;
    }

    // 7. Top unresolved company tags
    const { data: unresolvedTagsData, error: unresolvedError } =
      await serviceClient
        .from("content_tags")
        .select("value")
        .eq("dimension", "company")
        .is("entity_id", null);

    if (unresolvedError) {
      console.error("Pipeline query failed: unresolved tags data", unresolvedError);
      throw unresolvedError;
    }

    const unresolvedCounts: Record<string, number> = {};
    (unresolvedTagsData || []).forEach((row: { value: string }) => {
      unresolvedCounts[row.value] = (unresolvedCounts[row.value] || 0) + 1;
    });

    const topUnresolved = Object.entries(unresolvedCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 8. Articles ingested per day — last 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: articleTimeSeriesData, error: articleTSError } = await serviceClient
      .from("content")
      .select("created_at")
      .gte("created_at", fourteenDaysAgo);

    if (articleTSError) {
      console.error("Pipeline query failed: article time series", articleTSError);
      throw articleTSError;
    }

    // Group by date in JS
    const articleDateCounts: Record<string, number> = {};
    (articleTimeSeriesData || []).forEach((row: { created_at: string }) => {
      const date = row.created_at.split("T")[0];
      articleDateCounts[date] = (articleDateCounts[date] || 0) + 1;
    });

    // Fill in missing dates with zero
    const articleTimeSeries = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      articleTimeSeries.push({ date, count: articleDateCounts[date] || 0 });
    }

    // 9. Signals extracted per day — last 14 days
    const { data: signalTimeSeriesData, error: signalTSError } = await serviceClient
      .from("signals")
      .select("created_at")
      .gte("created_at", fourteenDaysAgo);

    if (signalTSError) {
      console.error("Pipeline query failed: signal time series", signalTSError);
      throw signalTSError;
    }

    // Group by date
    const signalDateCounts: Record<string, number> = {};
    (signalTimeSeriesData || []).forEach((row: { created_at: string }) => {
      const date = row.created_at.split("T")[0];
      signalDateCounts[date] = (signalDateCounts[date] || 0) + 1;
    });

    // Fill in missing dates
    const signalTimeSeries = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      signalTimeSeries.push({ date, count: signalDateCounts[date] || 0 });
    }

    // Build response
    const totalArticles = totalCount || 0;
    const tagged = taggedCount || 0;
    const taggedPct = totalArticles > 0 ? (tagged / totalArticles) * 100 : 0;

    const totalSignals =
      signalsByType.reduce((sum: number, s: { count: number }) => sum + s.count, 0) || 0;

    const totalCompany = totalCompanyTags || 0;
    const resolved = resolvedCompanyTags || 0;
    const resolvedPct = totalCompany > 0 ? (resolved / totalCompany) * 100 : 0;

    return NextResponse.json({
      articles: {
        total: totalArticles,
        tagged,
        taggedPct: Math.round(taggedPct * 10) / 10,
      },
      tagsByDimension,
      signals: {
        total: totalSignals,
        byType: signalsByType,
        lastCreatedAt: lastSignalData?.created_at || null,
      },
      importanceGate: {
        cleared: clearedCount || 0,
        clearedNoSignal,
      },
      entityResolution: {
        total: totalCompany,
        resolved,
        resolvedPct: Math.round(resolvedPct * 10) / 10,
        topUnresolved,
      },
      articleTimeSeries,
      signalTimeSeries,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Pipeline stats error:", msg, error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline stats", detail: msg },
      { status: 500 }
    );
  }
}
