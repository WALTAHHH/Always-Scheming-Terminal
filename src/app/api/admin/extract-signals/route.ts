import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { extractSignal } from "@/lib/signal-extractor";

export const runtime = "nodejs";
// Allow up to 5 minutes — this is a backfill that may process many articles
export const maxDuration = 300;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = getServiceClient();

  // Get articles with company + category tags that don't have signals yet
  const { data: items, error: fetchError } = await supabase
    .from("content")
    .select("id, title, body, tags, sources!inner(source_type)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200); // process in batches of 200

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Filter: must have company + category tags
  const eligible = (items || []).filter((item) => {
    const tags = (item.tags as Record<string, string[]>) || {};
    return tags.company?.length > 0 && tags.category?.length > 0;
  });

  // Filter out already-signaled articles
  const eligibleIds = eligible.map((i) => i.id);
  const { data: existingSignals } = await supabase
    .from("signals")
    .select("item_id")
    .in("item_id", eligibleIds);

  const signaled = new Set((existingSignals || []).map((s: any) => s.item_id));
  const todo = eligible.filter((i) => !signaled.has(i.id));

  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of todo) {
    const tags = (item.tags as Record<string, string[]>) || {};
    const hasResolvedEntity = (tags.company || []).length > 0;

    await extractSignal({
      supabase,
      item: {
        id: item.id,
        title: item.title,
        body: item.body,
        tags: item.tags as Record<string, string[]>,
        sources: { source_type: (item.sources as any).source_type },
      },
      hasResolvedEntity,
    });

    extracted++;
  }

  skipped = eligible.length - todo.length;

  const { count: totalSignals } = await supabase
    .from("signals")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    ok: true,
    summary: {
      eligible: eligible.length,
      alreadySignaled: skipped,
      processed: todo.length,
      extracted,
      failed,
      totalSignalsInDb: totalSignals,
    },
  });
}
