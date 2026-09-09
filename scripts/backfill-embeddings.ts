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

/**
 * Convert an embedding array to the string representation expected by the
 * Supabase vector(768) column.
 *
 * The vector column expects a PostgreSQL vector literal, which is a string
 * containing a comma-separated list of numbers inside square brackets, e.g.
 * '[0.1,0.2,-0.3]'. This matches the format used in the migration
 * `ALTER TABLE content ADD COLUMN embedding vector(768)` and the RPC call
 * `match_content(query_embedding vector(768), ...)` where the embedding is
 * cast as a string (see brief route).
 */
function embeddingToVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

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
      if (embedding.length !== 1536) {
        console.warn(`  Row ${row.id}: unexpected embedding length ${embedding.length}, skipping`);
        continue;
      }

      const embeddingStr = embeddingToVectorString(embedding);

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