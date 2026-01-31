/**
 * CLI ingestion runner.
 * Run: npm run ingest  (or: npx tsx scripts/ingest.ts)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// After loading .env, dynamically import the ingest module
async function main() {
  const { ingestAll } = await import("../src/lib/ingest");

  console.log("⚡ Starting ingestion...\n");

  const results = await ingestAll();

  let totalFetched = 0;
  let totalInserted = 0;

  for (const r of results) {
    const status = r.errors.length ? "✗" : "✓";
    console.log(`  ${status} ${r.source}: ${r.inserted} new / ${r.fetched} fetched`);
    if (r.errors.length) {
      r.errors.forEach((e) => console.log(`      → ${e}`));
    }
    totalFetched += r.fetched;
    totalInserted += r.inserted;
  }

  console.log(`\n  Total: ${totalInserted} new items from ${totalFetched} fetched across ${results.length} sources.`);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
