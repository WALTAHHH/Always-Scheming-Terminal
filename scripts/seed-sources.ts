/**
 * Seed the sources table with V1 feeds.
 * Run: npx tsx scripts/seed-sources.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { V1_SOURCES } from "../src/lib/sources";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log(`Seeding ${V1_SOURCES.length} sources...`);

  for (const source of V1_SOURCES) {
    const { data, error } = await supabase
      .from("sources")
      .upsert(source, { onConflict: "url" })
      .select("id, name")
      .single();

    if (error) {
      console.error(`  ✗ ${source.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${data.name} (${data.id})`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
