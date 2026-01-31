/**
 * Backfill tags on existing items using the hybrid tagger.
 * Run: npx tsx scripts/backfill-tags.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { tagItem, tagItemWithAI } from "../src/lib/tagger";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  // Get items with sources
  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, content, source_id, sources(source_type)")
    .order("published_at", { ascending: false });

  if (error || !items) {
    console.error("Failed to fetch items:", error?.message);
    process.exit(1);
  }

  console.log(`⚡ Tagging ${items.length} items...\n`);

  let tagged = 0;
  let tagCount = 0;

  for (const item of items) {
    const sourceType = (item as any).sources?.source_type || "news";
    const ruleTags = tagItem(item.title, item.content, sourceType);
    const aiTags = await tagItemWithAI(item.title, item.content);

    const allTags = {
      category: ruleTags.category,
      platform: ruleTags.platform,
      theme: [...new Set([...ruleTags.theme, ...aiTags.theme])],
      company: aiTags.company,
    };

    // Update items.tags jsonb
    await supabase
      .from("items")
      .update({ tags: allTags })
      .eq("id", item.id);

    // Upsert into item_tags
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
      tagCount += tagRows.length;
    }

    tagged++;
    const dims = Object.entries(allTags)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}:${v.length}`)
      .join(" ");
    
    if (tagged % 25 === 0 || tagged === items.length) {
      console.log(`  [${tagged}/${items.length}] ${dims || "(no tags)"} — ${item.title.slice(0, 60)}`);
    }
  }

  console.log(`\n✅ Tagged ${tagged} items, ${tagCount} total tag entries.`);
  if (!process.env.OPENAI_API_KEY) {
    console.log("ℹ️  No OPENAI_API_KEY — company tags skipped. Add key and re-run for AI tagging.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
