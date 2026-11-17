-- Rollback migration 020: restore permissive RLS policies (pre‑020 state)
-- Run this in Supabase SQL editor BEFORE applying 020, or if you need to revert.
-- WARNING: This re-enables blanket public read/write on the five tables.

BEGIN;

-- Drop the new policies
DROP POLICY IF EXISTS \"entities_public_read\" ON entities;
DROP POLICY IF EXISTS \"entities_owner_read\" ON entities;
DROP POLICY IF EXISTS \"signals_public_read\" ON signals;
DROP POLICY IF EXISTS \"signals_owner_read\" ON signals;
DROP POLICY IF EXISTS \"content_public_read\" ON content;
DROP POLICY IF EXISTS \"content_owner_read\" ON content;
DROP POLICY IF EXISTS \"content_tags_public_read\" ON content_tags;
DROP POLICY IF EXISTS \"entity_aliases_public_read\" ON entity_aliases;
DROP POLICY IF EXISTS \"entity_aliases_owner_read\" ON entity_aliases;

-- Drop indexes added for policy performance
DROP INDEX IF EXISTS public.idx_content_tags_content_entity;
DROP INDEX IF EXISTS public.idx_alert_events_user_entity;

-- Drop the helper functions
DROP FUNCTION IF EXISTS public.entity_is_public(uuid);
DROP FUNCTION IF EXISTS public.content_is_public(uuid);
DROP FUNCTION IF EXISTS public.user_owns_entity(uuid);
DROP FUNCTION IF EXISTS public.user_owns_signal(uuid);
DROP FUNCTION IF EXISTS public.user_owns_content(uuid);

-- Restore the pre‑020 blanket policies (read/write for everyone)
CREATE POLICY \"Service role full access\" ON entities
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY \"Service role full access\" ON signals
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY \"Service role full access\" ON entity_aliases
  FOR ALL USING (true) WITH CHECK (true);

-- content / content_tags were a pre‑003 baseline with no tracked RLS.
-- Disable RLS (their true pre‑020 state). If your live DB had an untracked
-- policy there, recreate it instead of relying on the DISABLE.
ALTER TABLE content      DISABLE ROW LEVEL SECURITY;
ALTER TABLE content_tags DISABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify that policies are restored
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