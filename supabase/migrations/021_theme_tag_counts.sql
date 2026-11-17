-- 021_theme_tag_counts.sql
--
-- Profile > Interests tag picker (card t_5ba5480e).
--
-- BUG: GET /api/tags/themes used to `select("value")` on every content_tags row
-- with dimension='theme' and dedupe in JS. PostgREST caps a single response at
-- 1000 rows, so once the table grew past that the later-alphabet themes were
-- silently dropped from the UI (the query was ordered value ASC). The route now
-- asks for a pre-aggregated, DISTINCT result with usage counts instead.
--
-- This function returns one row per distinct theme value with its usage count,
-- so the row count is bounded by the number of distinct themes (~hundreds) and
-- can never hit the 1000-row PostgREST cap.
--
-- NOTE: shipped as a migration but intentionally NOT applied here. The route
-- falls back to a paginated `.range()` scan when this RPC is absent (e.g. on an
-- environment that has not run this migration yet), so deploying the code
-- before the SQL is safe.

create or replace function public.theme_tag_counts()
returns table (value text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ct.value as value,
         count(*)::bigint as count
  from public.content_tags ct
  where ct.dimension = 'theme'
    and ct.value is not null
    and ct.value <> ''
  group by ct.value
  order by ct.value asc;
$$;

grant execute on function public.theme_tag_counts() to anon, authenticated, service_role;
