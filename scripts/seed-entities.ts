/**
 * Seed entities from Supabase migration 010 onwards.
 * The original companies.ts static data has been removed — entities are now
 * managed entirely in the DB via the entities + entity_aliases tables.
 *
 * To add a new company: INSERT into entities + entity_aliases via Supabase SQL Editor.
 * See supabase/migrations/010_entities_ir_fields.sql for schema.
 */

console.log("Entities are seeded via SQL migrations (supabase/migrations/). Use the Supabase SQL Editor.");
console.log("To add a new entity: INSERT INTO entities (...) and INSERT INTO entity_aliases (...)");
