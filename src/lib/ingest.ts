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
 */
async function ingestSource(source: SourceRow): Promise<IngestResult> {
  const result: IngestResult = {
    source: source.name,
    fetched: 0,
    inserted: 0,
    errors: [],
  };

  try {
    const feed = await parser.parseURL(source.feed_url);
    result.fetched = feed.items?.length ?? 0;

    if (!feed.items?.length) return result;

    const supabase = getSupabase();
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

          // Merge rule-based + AI tags
          const allTags = {
            category: ruleTags.category,
            platform: ruleTags.platform,
            theme: [...new Set([...ruleTags.theme, ...aiTags.theme])],
            company: aiTags.company,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fetch: ${msg}`);
  }

  return result;
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
