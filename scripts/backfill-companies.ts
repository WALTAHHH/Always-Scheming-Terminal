/**
 * Backfill company tags for all existing articles.
 * Run: npx tsx scripts/backfill-companies.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { tagItem } from "../src/lib/tagger";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function backfill() {
  // Fetch all items
  const PAGE_SIZE = 100;
  let offset = 0;
  let total = 0;
  let tagged = 0;

  console.log("Starting company backfill...\n");

  while (true) {
    const { data: items, error } = await supabase
      .from("items")
      .select("id, title, content, tags, source_id, sources(source_type)")
      .range(offset, offset + PAGE_SIZE - 1)
      .order("published_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Failed to fetch items:", error.message);
      break;
    }

    if (!items || items.length === 0) break;

    for (const item of items) {
      total++;
      const sourceType = (item.sources as any)?.source_type || "news";
      const result = tagItem(item.title, item.content, sourceType);

      if (result.company.length === 0) continue;

      // Merge with existing tags
      const existingTags = (item.tags as any) || {};
      const existingCompanies: string[] = existingTags.company || [];
      const mergedCompanies = [...new Set([...existingCompanies, ...result.company])];

      // Update tags jsonb
      const updatedTags = {
        ...existingTags,
        company: mergedCompanies,
      };

      const { error: updateErr } = await supabase
        .from("items")
        .update({ tags: updatedTags })
        .eq("id", item.id);

      if (updateErr) {
        console.error(`  Failed to update item ${item.id}: ${updateErr.message}`);
        continue;
      }

      // Upsert into item_tags for filtering
      const tagRows = mergedCompanies.map((c) => ({
        item_id: item.id,
        dimension: "company",
        value: c,
        manual: false,
      }));

      if (tagRows.length > 0) {
        const { error: tagErr } = await supabase
          .from("item_tags")
          .upsert(tagRows, { onConflict: "item_id,dimension,value", ignoreDuplicates: true });

        if (tagErr) {
          console.error(`  Failed to upsert tags for ${item.id}: ${tagErr.message}`);
        }
      }

      tagged++;
      if (tagged % 10 === 0) {
        console.log(`  Tagged ${tagged} articles so far...`);
      }
    }

    offset += PAGE_SIZE;
    if (items.length < PAGE_SIZE) break;
  }

  console.log(`\nDone! Scanned ${total} articles, tagged ${tagged} with companies.`);

  // Show top companies
  const { data: topCompanies } = await supabase
    .from("item_tags")
    .select("value")
    .eq("dimension", "company");

  if (topCompanies) {
    const counts: Record<string, number> = {};
    for (const row of topCompanies) {
      counts[row.value] = (counts[row.value] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log("\nTop 20 companies by mention count:");
    for (const [name, count] of sorted) {
      console.log(`  ${name}: ${count}`);
    }
  }
}

backfill().catch(console.error);
