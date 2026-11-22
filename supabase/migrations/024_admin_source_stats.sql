-- 024_admin_source_stats.sql
--
-- Admin page load time (card t_3b9101c5).
--
-- GET /api/sources enriched every source with `article_count` and
-- `latest_article_at` by issuing TWO queries per source (one exact COUNT and
-- one ordered LIMIT 1) from the route. With 45 sources that is 90 sequential
-- PostgREST round-trips per request: ~1 s warm and ~6 s cold against
-- production, and the Admin page blocks its whole content area on this call.
--
-- This migration moves the aggregation into one grouped SQL query returning
-- one row per source. The route calls the RPC and falls back to the old
-- per-source queries when the function is absent (same deploy-before-migrate
-- pattern as 022), so shipping the code first is safe.
--
-- article_count = rows in content for that source (exact, no 1000-row cap —
-- the count happens server-side).
-- latest_article_at = max(published_at) for that source.

create or replace function public.admin_source_stats()
returns table (source_id uuid, article_count bigint, latest_article_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.source_id, count(*)::bigint, max(c.published_at)
  from public.content c
  where c.source_id is not null
  group by c.source_id;
$$;

grant execute on function public.admin_source_stats() to service_role;
