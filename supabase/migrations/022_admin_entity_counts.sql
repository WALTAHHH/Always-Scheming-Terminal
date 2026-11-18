-- 022_admin_entity_counts.sql
--
-- Admin → Entities: the Tags and Signals columns showed 0 for every entity
-- (card t_ad4355ac).
--
-- Root causes in GET /api/admin/entities:
--   1. Signals: the route selected `signals.entity_id`, but `signals` has no
--      entity column at all (007/009 created `signals.item_id`, 014 renamed it
--      to `content_id`). The query therefore always errored and the route
--      swallowed the error, so signal_count was permanently 0. Signals are
--      linked to entities only through the content they were extracted from:
--      signals.content_id → (content_tags.entity_id | content.tags->'company').
--   2. Tags: the route counted `content_tags` rows that already carried a
--      non-null `entity_id`. Rows written by AI tagging / older ingestion paths
--      (and rows whose entity resolution never ran) have `entity_id IS NULL`
--      even though the tag value names a known entity, so the count was 0 even
--      though the feed (which renders `content.tags` JSONB) looked tagged.
--   3. Both of those queries selected raw rows; PostgREST caps a response at
--      1000 rows, so any per-row counting in JS is also wrong once the tables
--      grow past that.
--
-- This migration moves the aggregation into SQL. Both functions return a
-- bounded result set (one row per entity / one row per entity-day), so the
-- PostgREST row cap can never truncate them again. Entity matching accepts
-- three complementary sources and de-duplicates by (entity_id, content_id):
--   a. content_tags rows already resolved via `entity_id`
--   b. company-dimension rows whose value matches an entity canonical_name or
--      alias (case-insensitive) — this is exactly how ingest.ts and
--      POST /api/v1/entity-aliases backfill `entity_id`
--   c. content.tags->'company' values matching an entity name/alias — the JSONB
--      projection the feed renders
--
-- tag_count = number of DISTINCT content items tagged with the entity (so the
-- same article tagged both in JSONB and in content_tags counts once).
-- signal_count = number of DISTINCT signals extracted from content tagged with
-- the entity.
--
-- NOTE: shipped as a migration but intentionally NOT applied here. The route
-- falls back to a paginated `.range()` scan (same aggregation, in JS) when the
-- functions are absent, so deploying the code before running this SQL is safe.

create or replace function public.admin_entity_tagged_content()
returns table (entity_id uuid, content_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with alias_names as (
    select e.id as entity_id, lower(e.canonical_name) as name
    from public.entities e
    union
    select ea.entity_id, lower(ea.alias) as name
    from public.entity_aliases ea
  )
  -- a. rows already linked to an entity
  select ct.entity_id, ct.content_id
  from public.content_tags ct
  where ct.entity_id is not null
    and ct.content_id is not null
  union
  -- b. company tag rows resolved by tag value → entity name/alias
  select an.entity_id, ct.content_id
  from public.content_tags ct
  join alias_names an on an.name = lower(ct.value)
  where lower(ct.dimension) = 'company'
    and ct.content_id is not null
  union
  -- c. content.tags JSONB company array (what the feed renders)
  select an.entity_id, c.id as content_id
  from public.content c
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(c.tags -> 'company') = 'array' then c.tags -> 'company'
      else '[]'::jsonb
    end
  ) as v(company)
  join alias_names an on an.name = lower(v.company);
$$;

create or replace function public.admin_entity_counts()
returns table (entity_id uuid, tag_count bigint, signal_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with tagged as (
    select * from public.admin_entity_tagged_content()
  ),
  tag_counts as (
    select t.entity_id, count(distinct t.content_id)::bigint as n
    from tagged t
    group by t.entity_id
  ),
  signal_counts as (
    select t.entity_id, count(distinct s.id)::bigint as n
    from tagged t
    join public.signals s on s.content_id = t.content_id
    group by t.entity_id
  )
  select e.id as entity_id,
         coalesce(tc.n, 0)::bigint as tag_count,
         coalesce(sc.n, 0)::bigint as signal_count
  from public.entities e
  left join tag_counts tc on tc.entity_id = e.id
  left join signal_counts sc on sc.entity_id = e.id;
$$;

create or replace function public.admin_entity_tag_series(days integer default 30)
returns table (entity_id uuid, day date, tag_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.entity_id,
         (c.ingested_at)::date as day,
         count(distinct t.content_id)::bigint as tag_count
  from public.admin_entity_tagged_content() t
  join public.content c on c.id = t.content_id
  where c.ingested_at is not null
    and c.ingested_at >= now() - make_interval(days => greatest(coalesce(days, 30), 1))
  group by t.entity_id, (c.ingested_at)::date
  order by t.entity_id, day;
$$;

grant execute on function public.admin_entity_tagged_content() to service_role;
grant execute on function public.admin_entity_counts() to service_role;
grant execute on function public.admin_entity_tag_series(integer) to service_role;