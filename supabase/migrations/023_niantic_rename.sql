-- 023_niantic_rename.sql
--
-- Catch-up migration for a data change already applied by hand in prod:
--   * entity 'Niantic' (Mobile-First / F2P) renamed to 'Scopely Explore', now a
--     subsidiary of 'Scopely'. The old name is kept as a former_name alias.
--   * NEW entity 'Niantic Spatial' (private; Infrastructure / Middleware),
--     spun out of Niantic after the Scopely acquisition, with a canonical alias.
--
-- This file exists so a fresh environment (CI, a new Supabase project, local
-- dev) ends up in the same state as prod. It is intentionally NOT applied by
-- this PR — ship the code first, then run it. The rename only touches display
-- data; the app resolves entities by name/alias at runtime, so the code change
-- (profile segment copy) and this SQL can land in either order.
--
-- Everything below is idempotent and guarded, so re-running it (or running it
-- against prod, where the change is already applied) is a safe no-op.
--
-- NOTE: do NOT edit the applied seed migration 011_seed_entities.sql in place —
-- it must remain a faithful record of what was seeded initially.

-- 1. Rename the entity Niantic -> Scopely Explore.
--    Guarded so it only fires when the source name still exists and the target
--    name does not (i.e. exactly once, on a fresh seed).
update public.entities
set canonical_name = 'Scopely Explore'
where canonical_name = 'Niantic'
  and not exists (
    select 1 from public.entities where canonical_name = 'Scopely Explore'
  );

-- 2. Link Scopely Explore under its parent Scopely (prod has this).
update public.entities
set parent_id = (select id from public.entities where canonical_name = 'Scopely')
where canonical_name = 'Scopely Explore'
  and parent_id is null;

-- 3. Point the existing canonical alias at the new name.
--    'alias' is UNIQUE, so update in place rather than insert a duplicate.
--    Only matches the old canonical row and only when the new alias is free.
update public.entity_aliases
set alias = 'Scopely Explore', alias_type = 'canonical'
where alias = 'Niantic'
  and alias_type = 'canonical'
  and entity_id = (select id from public.entities where canonical_name = 'Scopely Explore')
  and not exists (
    select 1 from public.entity_aliases where alias = 'Scopely Explore'
  );

-- 4. Keep 'Niantic' as a former_name alias on Scopely Explore so articles that
--    still say "Niantic" keep resolving to the renamed entity.
--    Upsert: reassigns the row if it somehow still pointed elsewhere, and is a
--    no-op when it already holds the right (entity_id, type).
insert into public.entity_aliases (id, entity_id, alias, alias_type)
select gen_random_uuid(), e.id, 'Niantic', 'former_name'
from public.entities e
where e.canonical_name = 'Scopely Explore'
on conflict (alias) do update
  set entity_id = excluded.entity_id,
      alias_type = excluded.alias_type;

-- 5. New entity: Niantic Spatial (private, Infrastructure / Middleware).
insert into public.entities
  (id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, segment, market_cap_b, description)
values
  (gen_random_uuid(), 'Niantic Spatial', 'company', null, null, false, null,
   'Infrastructure / Middleware', null,
   'Geospatial / spatial-computing platform (spun out of Niantic after the Scopely acquisition)')
on conflict (canonical_name) do nothing;

-- 6. Canonical alias for Niantic Spatial (mirrors the 011 pattern).
insert into public.entity_aliases (id, entity_id, alias, alias_type)
select gen_random_uuid(), e.id, 'Niantic Spatial', 'canonical'
from public.entities e
where e.canonical_name = 'Niantic Spatial'
on conflict (alias) do nothing;
