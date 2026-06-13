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
    const { count: totalCount, error: totalError } = await serviceClient
      .from("content")
      .select("*", { count: "exact", head: true });

    if (totalError) throw totalError;

    // 2. Articles with any tags
    const { count: taggedCount, error: taggedError } = await serviceClient
      .from("content")
      .select("*", { count: "exact", head: true })
      .neq("tags", "{}")
      .not("tags", "is", null);

    if (taggedError) throw taggedError;

    // 3. Tag counts by dimension - fetch all and group manually
    const { data: allTags, error: tagsError } = await serviceClient
      .from("content_tags")
      .select("dimension");

    if (tagsError) throw tagsError;

    const dimensionCounts: Record<string, number> = {};
    (allTags || []).forEach((row: { dimension: string }) => {
      dimensionCounts[row.dimension] = (dimensionCounts[row.dimension] || 0) + 1;
    });

    const tagsByDimension = Object.entries(dimensionCounts)
      .map(([dimension, count]) => ({ dimension, count }))
      .sort((a, b) => b.count - a.count);

    // 4. Signals total + by type
    const { data: allSignals, error: signalsError } = await serviceClient
      .from("signals")
      .select("signal_type");

    if (signalsError) throw signalsError;

    const signalTypeCounts: Record<string, number> = {};
    (allSignals || []).forEach((row: { signal_type: string }) => {
      signalTypeCounts[row.signal_type] = (signalTypeCounts[row.signal_type] || 0) + 1;
    });

    const signalsByType = Object.entries(signalTypeCounts).map(
      ([signal_type, count]) => ({ signal_type, count })
    );

    // Last signal created
    const { data: lastSignalData, error: lastSignalError } =
      await serviceClient
        .from("signals")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastSignalError && lastSignalError.code !== "PGRST116")
      throw lastSignalError;

    // 5. Importance gate
    const { count: clearedCount, error: clearedError } = await serviceClient
      .from("content")
      .select("*", { count: "exact", head: true })
      .gte("importance_score", 0.4);

    if (clearedError) throw clearedError;

    // Articles cleared gate but no signal yet
    const { data: clearedContentData, error: clearedContentError } =
      await serviceClient
        .from("content")
        .select("id")
        .gte("importance_score", 0.4);

    if (clearedContentError) throw clearedContentError;

    const clearedIds = (clearedContentData || []).map((row: { id: string }) => row.id);
    let clearedNoSignal = 0;

    if (clearedIds.length > 0) {
      const { data: existingSignals, error: existingError } =
        await serviceClient.from("signals").select("content_id");

      if (existingError) throw existingError;

      const signalContentIds = new Set(
        (existingSignals || []).map((s: { content_id: string }) => s.content_id)
      );
      clearedNoSignal = clearedIds.filter((id: string) => !signalContentIds.has(id))
        .length;
    }

    // 6. Entity resolution coverage
    const { count: totalCompanyTags, error: totalCompanyError } =
      await serviceClient
        .from("content_tags")
        .select("*", { count: "exact", head: true })
        .eq("dimension", "company");

    if (totalCompanyError) throw totalCompanyError;

    const { count: resolvedCompanyTags, error: resolvedCompanyError } =
      await serviceClient
        .from("content_tags")
        .select("*", { count: "exact", head: true })
        .eq("dimension", "company")
        .not("entity_id", "is", null);

    if (resolvedCompanyError) throw resolvedCompanyError;

    // 7. Top unresolved company tags
    const { data: unresolvedTagsData, error: unresolvedError } =
      await serviceClient
        .from("content_tags")
        .select("value")
        .eq("dimension", "company")
        .is("entity_id", null);

    if (unresolvedError) throw unresolvedError;

    const unresolvedCounts: Record<string, number> = {};
    (unresolvedTagsData || []).forEach((row: { value: string }) => {
      unresolvedCounts[row.value] = (unresolvedCounts[row.value] || 0) + 1;
    });

    const topUnresolved = Object.entries(unresolvedCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
    });
  } catch (error) {
    console.error("Pipeline stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline stats" },
      { status: 500 }
    );
  }
}
