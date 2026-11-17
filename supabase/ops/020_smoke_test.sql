-- Smoke test for migration 020 RLS tightening (PR #138)
-- Run this in Supabase SQL editor AFTER applying 018,019,020 in order.
-- This script assumes there is at least one public entity and one private entity.
-- It does NOT modify any data.

-- 1. Check that the new policies exist
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

-- 2. Check that SECURITY DEFINER functions exist with search_path = ''
SELECT 
    proname,
    prosecdef,
    provolatile,
    proargtypes::regtype[] as arg_types,
    prosrc
FROM pg_proc
WHERE proname IN ('entity_is_public', 'content_is_public', 'user_owns_entity', 'user_owns_signal', 'user_owns_content')
    AND pronamespace = 'public'::regnamespace;

-- 3. Test anon role (no authentication)
SET ROLE anon;
SET request.jwt.claims TO '{}';

SELECT 'anon entities count' as label, COUNT(*) as cnt FROM entities;
SELECT 'anon signals count' as label, COUNT(*) as cnt FROM signals;
SELECT 'anon content count' as label, COUNT(*) as cnt FROM content;
SELECT 'anon content_tags count' as label, COUNT(*) as cnt FROM content_tags;
SELECT 'anon entity_aliases count' as label, COUNT(*) as cnt FROM entity_aliases;

-- Verify that anon cannot see private entities (should have zero rows where is_public = false)
-- Assuming there is at least one private entity
SELECT 'anon private entities' as label, COUNT(*) as cnt FROM entities WHERE is_public = false;

-- Reset role
RESET ROLE;
RESET request.jwt.claims;

-- 4. Test authenticated role (with a dummy user_id, no watchlists)
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000000"}';

SELECT 'authenticated entities count' as label, COUNT(*) as cnt FROM entities;
SELECT 'authenticated signals count' as label, COUNT(*) as cnt FROM signals;
SELECT 'authenticated content count' as label, COUNT(*) as cnt FROM content;
SELECT 'authenticated content_tags count' as label, COUNT(*) as cnt FROM content_tags;
SELECT 'authenticated entity_aliases count' as label, COUNT(*) as cnt FROM entity_aliases;

-- Should see same as anon because no watchlists
-- Reset
RESET ROLE;
RESET request.jwt.claims;

-- 5. Test service_role (bypasses RLS)
SET ROLE service_role;

SELECT 'service_role entities count' as label, COUNT(*) as cnt FROM entities;
SELECT 'service_role signals count' as label, COUNT(*) as cnt FROM signals;
SELECT 'service_role content count' as label, COUNT(*) as cnt FROM content;
SELECT 'service_role content_tags count' as label, COUNT(*) as cnt FROM content_tags;
SELECT 'service_role entity_aliases count' as label, COUNT(*) as cnt FROM entity_aliases;

-- service_role should see all rows, including private ones
SELECT 'service_role private entities' as label, COUNT(*) as cnt FROM entities WHERE is_public = false;

RESET ROLE;

-- 6. Verify that anon/authenticated cannot INSERT/UPDATE/DELETE (no policies)
-- Check that there are no INSERT/UPDATE/DELETE policies for anon/authenticated on these tables
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

-- If any rows returned, that's a problem.

-- 7. Summary
SELECT 'Smoke test completed. Compare counts: anon <= authenticated <= service_role.' as note;