import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";
import { createClient } from "@supabase/supabase-js";
import { tagItemWithAI } from "@/lib/tagger";

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";

  if (!isCron) {
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
  }

  try {
    const results = await ingestAll();

    // Fire-and-forget straggler sweep for recent untagged items
    (async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        );
        const { data: untagged } = await supabase
          .from('content')
          .select('id, title, body, tags')
          .or('tags->>company.is.null,tags->company.eq.[]')
          .gte('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(20);
        if (!untagged?.length) return;

        for (const item of untagged) {
          try {
            const aiTags = await tagItemWithAI(item.title, item.body);
            const currentTags = item.tags as { category: string[]; platform: string[]; theme: string[]; company: string[] } | null;
            const baseTags = currentTags || { category: [], platform: [], theme: [], company: [] };
            const mergedTags = {
              category: baseTags.category,
              platform: baseTags.platform,
              theme: Array.from(new Set([...baseTags.theme, ...aiTags.theme])),
              company: Array.from(new Set([...baseTags.company, ...aiTags.company])),
            };
            await supabase.from('content').update({ tags: mergedTags }).eq('id', item.id);
            // content_tags upsert
            const newTagRows: { content_id: string; dimension: string; value: string; manual: boolean }[] = [];
            for (const theme of aiTags.theme) {
              if (!baseTags.theme.includes(theme)) {
                newTagRows.push({ content_id: item.id, dimension: 'theme', value: theme, manual: false });
              }
            }
            for (const company of aiTags.company) {
              if (!baseTags.company.includes(company)) {
                newTagRows.push({ content_id: item.id, dimension: 'company', value: company, manual: false });
              }
            }
            if (newTagRows.length > 0) {
              await supabase.from('content_tags').upsert(newTagRows, { onConflict: 'content_id,dimension,value', ignoreDuplicates: true });
            }
          } catch (err) {
            console.error(`Straggler sweep failed for item ${item.id}:`, err);
          }
        }
      } catch (err) {
        console.error('Straggler sweep failed:', err);
      }
    })();
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
        straggler_tagged: 0,
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
