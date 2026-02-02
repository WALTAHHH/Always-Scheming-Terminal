import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { tagItem, tagItemWithAI } from "./tagger";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "AlwaysSchemingTerminal/1.0",
  },
});

export interface IngestResult {
  source: string;
  fetched: number;
  inserted: number;
  errors: string[];
}

interface SourceRow {
  id: string;
  name: string;
  url: string;
  feed_url: string;
  source_type: string;
  active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  last_success_at: string | null;
  created_at: string;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Fetch and ingest RSS items for a single source.
 * Deduplicates on (source_id, external_id).
 * Logs results to ingestion_logs and tracks errors on sources.
 */
async function ingestSource(source: SourceRow): Promise<IngestResult> {
  const startTime = Date.now();
  const result: IngestResult = {
    source: source.name,
    fetched: 0,
    inserted: 0,
    errors: [],
  };

  const supabase = getSupabase();

  try {
    const feed = await parser.parseURL(source.feed_url);
    result.fetched = feed.items?.length ?? 0;

    if (!feed.items?.length) {
      // Successful fetch but empty feed — still counts as success
      await logIngestion(supabase, source.id, result, startTime, true);
      await updateSourceHealth(supabase, source.id, null);
      return result;
    }

    const rows = feed.items.map((item) => ({
      source_id: source.id,
      external_id: item.guid || item.link || item.title || "",
      title: item.title || "(no title)",
      content: item.contentSnippet || item.content || null,
      url: item.link || source.url,
      author: item.creator || item.author || null,
      published_at: item.isoDate || null,
      tags: {},
    }));

    // Upsert — on conflict (source_id, external_id) do nothing
    const { data, error } = await supabase
      .from("items")
      .upsert(rows, { onConflict: "source_id,external_id", ignoreDuplicates: true })
      .select("id, title, content");

    if (error) {
      result.errors.push(`DB: ${error.message}`);
    } else {
      result.inserted = data?.length ?? 0;

      // Tag newly inserted items
      if (data?.length) {
        for (const item of data) {
          const ruleTags = tagItem(item.title, item.content, source.source_type);
          const aiTags = await tagItemWithAI(item.title, item.content);

          // Merge rule-based + AI tags (deduplicate companies and themes)
          const allTags = {
            category: ruleTags.category,
            platform: ruleTags.platform,
            theme: [...new Set([...ruleTags.theme, ...aiTags.theme])],
            company: [...new Set([...ruleTags.company, ...aiTags.company])],
          };

          // Store in items.tags jsonb
          await supabase
            .from("items")
            .update({ tags: allTags })
            .eq("id", item.id);

          // Store in item_tags (normalized for filtering)
          const tagRows: { item_id: string; dimension: string; value: string; manual: boolean }[] = [];
          for (const [dimension, values] of Object.entries(allTags)) {
            for (const value of values) {
              tagRows.push({ item_id: item.id, dimension, value, manual: false });
            }
          }
          if (tagRows.length > 0) {
            await supabase
              .from("item_tags")
              .upsert(tagRows, { onConflict: "item_id,dimension,value", ignoreDuplicates: true });
          }
        }
      }
    }

    // Update last_fetched_at
    await supabase
      .from("sources")
      .update({ last_fetched_at: new Date().toISOString() })
      .eq("id", source.id);

    const success = result.errors.length === 0;
    await logIngestion(supabase, source.id, result, startTime, success);
    await updateSourceHealth(supabase, source.id, success ? null : result.errors.join("; "));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fetch: ${msg}`);
    await logIngestion(supabase, source.id, result, startTime, false);
    await updateSourceHealth(supabase, source.id, msg);
  }

  return result;
}

/**
 * Log ingestion result to ingestion_logs table.
 */
async function logIngestion(
  supabase: ReturnType<typeof getSupabase>,
  sourceId: string,
  result: IngestResult,
  startTime: number,
  success: boolean
) {
  try {
    await supabase.from("ingestion_logs").insert({
      source_id: sourceId,
      fetched: result.fetched,
      inserted: result.inserted,
      errors: result.errors,
      success,
      duration_ms: Date.now() - startTime,
    });
  } catch {
    // Don't let logging failures break ingestion
  }
}

/**
 * Update source health tracking columns.
 * On success: clear error, reset consecutive count, update last_success_at.
 * On failure: set error message, increment consecutive count.
 */
async function updateSourceHealth(
  supabase: ReturnType<typeof getSupabase>,
  sourceId: string,
  errorMsg: string | null
) {
  try {
    if (errorMsg) {
      // Failure — increment consecutive errors
      await supabase.rpc("increment_source_errors", {
        sid: sourceId,
        err: errorMsg,
      }).then(async (res) => {
        // Fallback if RPC doesn't exist yet
        if (res.error) {
          const { data: source } = await supabase
            .from("sources")
            .select("consecutive_errors")
            .eq("id", sourceId)
            .single();
          await supabase
            .from("sources")
            .update({
              last_error: errorMsg,
              consecutive_errors: (source?.consecutive_errors || 0) + 1,
            })
            .eq("id", sourceId);
        }
      });
    } else {
      // Success — clear errors
      await supabase
        .from("sources")
        .update({
          last_error: null,
          consecutive_errors: 0,
          last_success_at: new Date().toISOString(),
        })
        .eq("id", sourceId);
    }
  } catch {
    // Don't let health tracking break ingestion
  }
}

/**
 * Ingest all active sources. Returns results per source.
 */
export async function ingestAll(): Promise<IngestResult[]> {
  const supabase = getSupabase();
  const { data: sources, error } = await supabase
    .from("sources")
    .select("*")
    .eq("active", true);

  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  if (!sources?.length) return [];

  // Run in parallel (sources are independent)
  const results = await Promise.allSettled(
    sources.map((s: SourceRow) => ingestSource(s))
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          source: (sources[i] as SourceRow).name,
          fetched: 0,
          inserted: 0,
          errors: [r.reason?.message || "Unknown error"],
        }
  );
}
