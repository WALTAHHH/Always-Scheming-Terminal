/**
 * Backfill embeddings for all content rows where embedding IS NULL.
 * Run: npx tsx scripts/backfill-embeddings.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Requires GOOGLE_AI_API_KEY in environment (set in Vercel production).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "../src/lib/embeddings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function backfillEmbeddings() {
  const BATCH_SIZE = 50;
  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;

  console.log("Starting embeddings backfill...\n");

  while (true) {
    // Fetch a batch of rows without embeddings
    const { data: rows, error } = await supabase
      .from("content")
      .select("id, title, body")
      .is("embedding", null)
      .range(offset, offset + BATCH_SIZE - 1)
      .order("published_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch rows:", error.message);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log("No more rows without embeddings.");
      break;
    }

    console.log(`Processing batch ${Math.floor(offset / BATCH_SIZE) + 1} (${rows.length} rows)`);

    for (const row of rows) {
      totalProcessed++;
      const text = `${row.title} ${row.body || ""}`.trim();
      if (!text) {
        console.warn(`  Row ${row.id} has empty title and body, skipping`);
        continue;
      }

      const embedding = await generateEmbedding(text);
      if (embedding.length === 0) {
        console.warn(`  Row ${row.id}: failed to generate embedding (maybe GOOGLE_AI_API_KEY not set)`);
        continue;
      }
      if (embedding.length !== 768) {
        console.warn(`  Row ${row.id}: unexpected embedding length ${embedding.length}, skipping`);
        continue;
      }

      // Convert embedding array to string representation expected by vector(768) column.
      // The vector column expects a string like '[0.1,0.2,...]' (JSON array without outer quotes).
      const embeddingStr = `[${embedding.join(",")}]`;

      const { error: updateError } = await supabase
        .from("content")
        .update({ embedding: embeddingStr })
        .eq("id", row.id);

      if (updateError) {
        console.error(`  Failed to update row ${row.id}:`, updateError.message);
        continue;
      }

      totalUpdated++;
      if (totalUpdated % 10 === 0) {
        console.log(`  Updated ${totalUpdated} rows so far...`);
      }
    }

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`\nDone! Processed ${totalProcessed} rows, updated ${totalUpdated} embeddings.`);
}

backfillEmbeddings().catch(console.error);