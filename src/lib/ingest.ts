import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import { tagItem, tagItemWithAI } from "./tagger";
import { extractSignal } from "./signal-extractor";
import { resolveEntitiesFromText } from "./entity-resolver";

const parser = new Parser({
  timeout: 8000, // Reduced from 15s for faster failure on stale feeds
  headers: {
    "User-Agent": "AlwaysSchemingTerminal/1.0",
  },
});

/**
 * Fetch RSS with exponential backoff retry.
 * Max 2 retries with 1s, 2s delays for transient failures.
 */
async function fetchWithRetry(url: string, maxRetries = 2): Promise<Parser.Output<Record<string, unknown>>> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await parser.parseURL(url);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

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

// Lazy singleton - avoids creating new client on every call
// TODO: type as ReturnType<typeof createClient<Database>> after migrations run + types regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
}

/**
 * Apply AI tags asynchronously to items (fire-and-forget).
 * Augments existing rule-based tags with AI-detected companies/themes.
 * Does NOT block ingestion — failures are logged but don't propagate.
 */
async function applyAITagsAsync(
  supabase: ReturnType<typeof getSupabase>,
  items: { id: string; title: string; body: string | null; tags: { category: string[]; platform: string[]; theme: string[]; company: string[] } }[],
  sourceType: string
): Promise<void> {
  // Run AI tagging in parallel for all items (with 4s timeout per call)
  const aiTagPromises = items.map(async (item) => {
    try {
      const aiTags = await tagItemWithAI(item.title, item.body);
      
      // Merge AI tags with existing rule-based tags (dedupe)
      const mergedTags = {
        category: item.tags.category, // AI doesn't tag category
        platform: item.tags.platform, // AI doesn't tag platform
        theme: [...new Set([...item.tags.theme, ...aiTags.theme])],
        company: [...new Set([...item.tags.company, ...aiTags.company])],
      };

      // Update content.tags JSONB column
      await supabase.from("content").update({ tags: mergedTags }).eq("id", item.id);

      // Add new AI-discovered tags to content_tags (won't duplicate existing ones)
      const newTagRows: { item_id: string; dimension: string; value: string; manual: boolean }[] = [];
      for (const theme of aiTags.theme) {
        if (!item.tags.theme.includes(theme)) {
          newTagRows.push({ item_id: item.id, dimension: "theme", value: theme, manual: false });
        }
      }
      for (const company of aiTags.company) {
        if (!item.tags.company.includes(company)) {
          newTagRows.push({ item_id: item.id, dimension: "company", value: company, manual: false });
        }
      }

      if (newTagRows.length > 0) {
        await supabase
          .from("content_tags")
          .upsert(newTagRows, { onConflict: "item_id,dimension,value", ignoreDuplicates: true });
      }

      return { id: item.id, success: true };
    } catch (err) {
      console.error(`[AI tag async] Failed for item ${item.id}:`, err);
      return { id: item.id, success: false };
    }
  });

  await Promise.allSettled(aiTagPromises);
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
    const feed = await fetchWithRetry(source.feed_url);
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
      body: item.bodySnippet || item.body || null,
      url: item.link || source.url,
      author: item.creator || item.author || null,
      published_at: item.isoDate || null,
      tags: {},
    }));

    // Upsert — on conflict (source_id, external_id) do nothing
    const { data, error } = await supabase
      .from("content")
      .upsert(rows, { onConflict: "source_id,external_id", ignoreDuplicates: true })
      .select("id, title, body");

    if (error) {
      result.errors.push(`DB: ${error.message}`);
    } else {
      result.inserted = data?.length ?? 0;

      // Tag newly inserted items (rule-based only, AI tags applied async)
      if (data?.length) {
        // Step 1: Apply rule-based tags immediately (no AI blocking)
        const itemsWithRuleTags = data.map((item: { id: string; title: string; body: string | null }) => {
          const ruleTags = tagItem(item.title, item.body, source.source_type);
          return {
            id: item.id,
            title: item.title,
            body: item.body,
            tags: {
              category: ruleTags.category,
              platform: ruleTags.platform,
              theme: ruleTags.theme,
              company: ruleTags.company,
            },
          };
        });

        // Step 2: Batch update items.tags with rule-based tags (parallel DB writes)
        await Promise.all(
          itemsWithRuleTags.map((item: typeof itemsWithRuleTags[0]) =>
            supabase.from("content").update({ tags: item.tags }).eq("id", item.id)
          )
        );

        // Step 3: Collect all content_tags rows for single batch upsert
        const allTagRows: { item_id: string; dimension: string; value: string; manual: boolean }[] = [];
        for (const item of itemsWithRuleTags) {
          for (const [dimension, values] of Object.entries(item.tags) as [string, string[]][]) {
            for (const value of values) {
              allTagRows.push({ item_id: item.id, dimension, value, manual: false });
            }
          }
        }
        if (allTagRows.length > 0) {
          await supabase
            .from("content_tags")
            .upsert(allTagRows, { onConflict: "item_id,dimension,value", ignoreDuplicates: true });
        }

        // Step 4: Entity resolution + signal extraction (uses rule-based tags)
        for (const item of itemsWithRuleTags) {
          const { id, tags } = item;
          try {
            const itemData = data.find((d: { id: string }) => d.id === id);
            if (!itemData) continue;

            const text = `${itemData.title} ${itemData.body || ""}`;
            
            // Resolve entities from text using entity_resolver
            const resolvedEntities = await resolveEntitiesFromText(text);
            const hasResolvedEntity = resolvedEntities.length > 0;

            // Update content_tags rows with resolved entity_ids
            for (const entity of resolvedEntities) {
              await supabase
                .from("content_tags")
                .upsert({
                  item_id: id,
                  dimension: "company",
                  value: entity.canonical_name,
                  entity_id: entity.entity_id,
                  manual: false,
                }, { onConflict: "item_id,dimension,value", ignoreDuplicates: false });
            }

            // Try signal extraction (non-blocking, errors logged internally)
            const itemForSignal = {
              id,
              title: item.title,
              body: item.body,
              tags,
              sources: { source_type: source.source_type },
            };

            await extractSignal({
              supabase,
              item: itemForSignal,
              hasResolvedEntity,
            });
          } catch (err) {
            // Entity resolution or signal extraction failed — log but don't break ingestion
            console.warn(`[ingest] Entity resolution/signal extraction failed for item ${id}:`, err);
          }
        }

        // Step 5: Apply AI tags asynchronously (fire-and-forget, won't block ingestion)
        applyAITagsAsync(supabase, itemsWithRuleTags, source.source_type).catch((err) => {
          console.error("[ingest] AI tagging async batch failed:", err);
        });
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
      }).then(async (res: { error: Error | null }) => {
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
 * Ingest a single source by ID. Returns the result.
 */
export async function ingestOne(sourceId: string): Promise<IngestResult> {
  const supabase = getSupabase();
  const { data: source, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (error || !source) {
    return { source: "unknown", fetched: 0, inserted: 0, errors: [`Source not found: ${sourceId}`] };
  }

  return ingestSource(source as SourceRow);
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
