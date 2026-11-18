-- Smoke test for migration 020 RLS tightening (PR #145)
-- Run this in the Supabase SQL editor AFTER applying 018, 019, 020 in order.
-- It does NOT modify any data.
--
-- Expected model after 020:
--   * anon          → 0 rows on all five tables (no SELECT policy for anon)
--   * authenticated → ALL rows on all five tables, including entities with
--                     is_public = false or NULL (is_public is "publicly traded",
--                     NOT visibility — it must not gate reads)
--   * service_role  → all rows (BYPASSRLS)
--
-- "0 rows/denied" below means either an empty result or a permission error for
-- the anon role; both are acceptable. An anon count > 0 is a failure.

-- 1. The new policies exist and are authenticated-only, SELECT-only
SELECT
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('entities', 'signals', 'content', 'content_tags', 'entity_aliases')
ORDER BY tablename, policyname;
-- Expected: exactly one policy per table, all named *_authenticated_read,
-- roles = {authenticated}, cmd = SELECT, qual = true. No policy with anon.

-- 2. The previous draft's helper functions are gone
SELECT proname
FROM pg_proc
WHERE proname IN ('entity_is_public', 'content_is_public', 'user_owns_entity',
                  'user_owns_signal', 'user_owns_content')
    AND pronamespace = 'public'::regnamespace;
-- Expected: 0 rows.

-- 3. anon role: no direct table read. Every count must be 0 (or denied).
SET ROLE anon;
SET request.jwt.claims TO '{}';

SELECT 'anon entities count'      AS label, COUNT(*) AS cnt FROM entities;
SELECT 'anon signals count'       AS label, COUNT(*) AS cnt FROM signals;
SELECT 'anon content count'       AS label, COUNT(*) AS cnt FROM content;
SELECT 'anon content_tags count'  AS label, COUNT(*) AS cnt FROM content_tags;
SELECT 'anon entity_aliases count' AS label, COUNT(*) AS cnt FROM entity_aliases;

-- Sanity: anon must not be able to see non-public (private) companies either.
SELECT 'anon non-public entities' AS label, COUNT(*) AS cnt
FROM entities WHERE is_public IS NOT TRUE;

RESET ROLE;
RESET request.jwt.claims;

-- 4. authenticated role: ALL rows, including non-public entities.
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000000"}';

SELECT 'authenticated entities count'      AS label, COUNT(*) AS cnt FROM entities;
SELECT 'authenticated signals count'       AS label, COUNT(*) AS cnt FROM signals;
SELECT 'authenticated content count'       AS label, COUNT(*) AS cnt FROM content;
SELECT 'authenticated content_tags count'  AS label, COUNT(*) AS cnt FROM content_tags;
SELECT 'authenticated entity_aliases count' AS label, COUNT(*) AS cnt FROM entity_aliases;

-- The whole point of the semantic correction: non-public companies are visible.
SELECT 'authenticated non-public entities' AS label, COUNT(*) AS cnt
FROM entities WHERE is_public IS NOT TRUE;
-- Expected: equals the service_role count below (and > 0 if such entities exist).

RESET ROLE;
RESET request.jwt.claims;

-- 5. service_role: bypasses RLS and sees everything.
SET ROLE service_role;

SELECT 'service_role entities count'      AS label, COUNT(*) AS cnt FROM entities;
SELECT 'service_role signals count'       AS label, COUNT(*) AS cnt FROM signals;
SELECT 'service_role content count'       AS label, COUNT(*) AS cnt FROM content;
SELECT 'service_role content_tags count'  AS label, COUNT(*) AS cnt FROM content_tags;
SELECT 'service_role entity_aliases count' AS label, COUNT(*) AS cnt FROM entity_aliases;

SELECT 'service_role non-public entities' AS label, COUNT(*) AS cnt
FROM entities WHERE is_public IS NOT TRUE;

RESET ROLE;

-- 6. No write policies for anon/authenticated on these tables
SELECT
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('entities', 'signals', 'content', 'content_tags', 'entity_aliases')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles));
-- Expected: 0 rows. Any row here is a problem.

-- 7. Summary
SELECT 'Smoke test completed. Expected: anon = 0 on all five tables; authenticated = service_role on all five; authenticated non-public entities = service_role non-public entities.' AS note;
