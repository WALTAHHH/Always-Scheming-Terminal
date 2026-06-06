/**
 * Seed entities + entity_aliases from the existing GAMING_COMPANIES array.
 * One-time migration script that:
 * 1. Reads GAMING_COMPANIES from companies.ts
 * 2. Inserts canonical entities into the entities table
 * 3. Inserts all aliases (including canonical name) into entity_aliases
 *
 * Run with: npx tsx scripts/seed-entities.ts
 */

import { createClient } from "@supabase/supabase-js";
import { GAMING_COMPANIES, CompanyData } from "../src/lib/companies";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  ticker: string | null;
  exchange: string | null;
  is_public: boolean;
  parent_id: string | null;
  description: string | null;
}

interface EntityAlias {
  entity_id: string;
  alias: string;
  alias_type: string;
}

async function seedEntities() {
  console.log(`🌱 Seeding ${GAMING_COMPANIES.length} entities...`);

  const entities: Omit<Entity, "id">[] = [];
  const aliasMap = new Map<string, EntityAlias[]>(); // canonical_name -> aliases
  const parentMap = new Map<string, string>(); // child canonical_name -> parent canonical_name

  // Phase 1: Build entities and record parent relationships
  for (const company of GAMING_COMPANIES) {
    const isPublic = !company.isPrivate && company.ticker !== "";

    entities.push({
      canonical_name: company.name,
      entity_type: "company",
      ticker: company.ticker || null,
      exchange: company.exchange || null,
      is_public: isPublic,
      parent_id: null, // will resolve in phase 2
      description: company.segment || null,
    });

    // Build alias list
    const aliases: EntityAlias[] = [];

    // Canonical name is an alias too
    aliases.push({
      entity_id: "", // will fill after insert
      alias: company.name,
      alias_type: "canonical",
    });

    // Ticker is an alias
    if (company.ticker && company.ticker !== "") {
      aliases.push({
        entity_id: "",
        alias: company.ticker,
        alias_type: "ticker",
      });
    }

    // All other aliases
    for (const alias of company.aliases) {
      aliases.push({
        entity_id: "",
        alias: alias,
        alias_type: "common",
      });
    }

    aliasMap.set(company.name, aliases);

    // Record parent relationship for phase 2
    if (company.parentCompany) {
      parentMap.set(company.name, company.parentCompany);
    }
  }

  // Phase 2: Insert entities and get UUIDs
  console.log("📦 Inserting entities...");
  const { data: insertedEntities, error: entityError } = await supabase
    .from("entities")
    .insert(entities)
    .select();

  if (entityError) {
    console.error("❌ Error inserting entities:", entityError);
    process.exit(1);
  }

  console.log(`✅ Inserted ${insertedEntities.length} entities`);

  // Build canonical_name -> uuid map
  const nameToId = new Map<string, string>();
  for (const entity of insertedEntities) {
    nameToId.set(entity.canonical_name, entity.id);
  }

  // Phase 3: Resolve parent_id FKs
  console.log("🔗 Resolving parent relationships...");
  for (const [childName, parentName] of parentMap.entries()) {
    const childId = nameToId.get(childName);
    const parentId = nameToId.get(parentName);

    if (!childId || !parentId) {
      console.warn(`⚠️  Could not resolve parent relationship: ${childName} -> ${parentName}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("entities")
      .update({ parent_id: parentId })
      .eq("id", childId);

    if (updateError) {
      console.error(`❌ Error updating parent_id for ${childName}:`, updateError);
    }
  }

  // Phase 4: Insert aliases
  console.log("🏷️  Inserting aliases...");
  const allAliases: EntityAlias[] = [];

  for (const entity of insertedEntities) {
    const aliases = aliasMap.get(entity.canonical_name);
    if (!aliases) continue;

    for (const alias of aliases) {
      allAliases.push({
        entity_id: entity.id,
        alias: alias.alias,
        alias_type: alias.alias_type,
      });
    }
  }

  const { error: aliasError } = await supabase
    .from("entity_aliases")
    .insert(allAliases);

  if (aliasError) {
    console.error("❌ Error inserting aliases:", aliasError);
    process.exit(1);
  }

  console.log(`✅ Inserted ${allAliases.length} aliases`);
  console.log("🎉 Seed complete!");
}

seedEntities().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
