-- 020: Tighten open read RLS policies on signals / content / entities (review finding #3)
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- Every sibling table was created with a blanket `FOR ALL USING (true)` policy
-- ("Service role full access"). Because the policy has no `TO` clause it applies
-- to PUBLIC — i.e. to `anon` and `authenticated` too — so *any* holder of the
-- public anon key (shipped to every browser) can `SELECT` every row of
-- `entities` / `signals` / `entity_aliases` directly through PostgREST, bypassing
-- the ownership checks the watchlist/alert APIs perform. `content` /
-- `content_tags` carry no RLS in any tracked migration at all (pre-003 baseline),
-- so they were equally open. See docs/rls-read-path-inventory.md (task t_11cf9c5c).
--
-- This migration replaces those blanket policies with *scoped* ones:
--   * anon + authenticated may read a row only when it is reachable from a
--     PUBLIC entity (`entities.is_public = true`) — the public site/API surface;
--   * `authenticated` may additionally read rows that belong to the caller's
--     OWN watchlist / alert ledger (ownership-scoped), so the alert-list and
--     watchlist embeds keep resolving for private (legacy) follows;
--   * everything else (private-entity rows not tied to the caller) is readable
--     only by `service_role`, which has BYPASSRLS and is used by every server
--     route / cron job in the app.
-- No broad authenticated read is granted.
--
-- ── Scope ────────────────────────────────────────────────────────────────────
-- In scope (touched here): entities, signals, content, content_tags, entity_aliases.
-- Explicitly NOT touched:
--   * 018_watchlists_and_alerts.sql — watchlists / alert_events policies are
--     per-user and already correct.
--   * 011 user_preferences — per-user, correct.
--   * api_keys (008) — also `USING (true)`, but that exposes key material; it is
--     a SEPARATE, higher-severity finding and is deliberately left for its own
--     card (do not fold it in here).
--   * profiles (011) — `USING (true)` FOR SELECT is intentional-public by name.
--   * ingestion_logs (003) — ops data, separate decision.
--   * sources — no RLS in any migration and no entity data; `/api/sources` having
--     no auth on any verb is a separate pre-existing finding (see below).
--
-- ── Product decisions DOCUMENTED, not guessed (per task instruction) ─────────
-- Tightening RLS closes the DIRECT authenticated-PostgREST vector. It does NOT
-- change the app's own output, because nearly every reader runs on the
-- service_role key and bypasses RLS (docs/rls-read-path-inventory.md §3a/§5A).
-- The following public, unauthenticated service-role routes therefore still
-- return ALL content/signals/entities regardless of these policies. Whether they
-- should be filtered to `is_public` is a PRODUCT decision and is intentionally
-- NOT changed here:
--     GET /api/v1/signals, /api/v1/signals/[id]   (no auth at all)
--     GET /api/feed.xml                           (no auth)
--     GET /api/tags/categories                    (no auth)
--     GET /api/v1/entities?public=true|&alias=    (no auth for those modes)
--     GET /api/v1/entity-aliases                  (no auth)
--     ALL /api/sources verbs incl. DELETE         (no auth on any verb)
-- Also flagged separately (not fixed here): `api_keys` USING(true) exposure;
-- `api_keys.scopes` is never enforced; `/` is login-gated today so the "public
-- site" is only the API/discovery surface.
--
-- ── App code adjusted ────────────────────────────────────────────────────────
-- src/app/api/tags/themes/route.ts read `content_tags` on the *authenticated*
-- client. content_tags is now scoped to public-entity content, which would
-- silently drop global theme tags that only appear on private content, so that
-- route now performs its query on the service-role client AFTER its session
-- check (server-only — SERVICE_ROLE never enters a client bundle).
--
-- ── Reversibility ────────────────────────────────────────────────────────────
-- A full ROLLBACK / DOWN block is at the BOTTOM of this file (commented out).
-- RLS itself is left enabled on content/content_tags by the rollback only if a
-- permissive policy is restored; the block below DISABLEs RLS on them because
-- this migration is the first tracked migration to enable it there. If the
-- deployed DB already enforced RLS on content/content_tags (untracked), recreate
-- that table's previous policy instead of disabling RLS.
--
-- ── Idempotency / applied-state caveat ───────────────────────────────────────
-- content / content_tags / sources never had a tracked CREATE POLICY, so the
-- policy NAMES on the live DB are unknown. The DO block below drops EVERY
-- permissive (`USING (true)`) policy it finds on the in-scope tables — by
-- expression, not by name — so naming drift cannot leave a hole behind.
--
-- Safe to re-run.

-- ── 0. Drop every blanket USING(true) policy on the in-scope tables ──────────
-- Names on the live DB are only partly known ("Service role full access" on
-- entities/signals/entity_aliases). Match by expression so content/content_tags
-- are covered too, and so a renamed-but-still-`true` policy can't survive.
DO $$
DECLARE
  r record;
  targets text[] := ARRAY['entities', 'signals', 'content', 'content_tags', 'entity_aliases'];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (targets)
      AND (
        qual IN ('true', '(true)')
        OR (qual IS NULL AND with_check IN ('true', '(true)'))
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE '020: dropped permissive policy %.% (%)', r.tablename, r.policyname, 'USING(true)';
  END LOOP;
END $$;

-- Belt-and-braces: explicit drops for the names we do know (no-op if the DO
-- block already removed them).
DROP POLICY IF EXISTS "Service role full access" ON entities;
DROP POLICY IF EXISTS "Service role full access" ON signals;
DROP POLICY IF EXISTS "Service role full access" ON entity_aliases;

-- ── 1. RLS on the tables that never had a tracked policy ─────────────────────
-- Idempotent; enabling RLS on `content`/`content_tags` is what actually closes
-- the read exposure for the pre-003 baseline tables.
ALTER TABLE content       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_tags  ENABLE ROW LEVEL SECURITY;

-- ── 2. Helper functions (SECURITY DEFINER) ───────────────────────────────────
-- Policy expressions that sub-query other RLS-protected tables would otherwise
-- be subject to those tables' own RLS and could recurse (content ↔ content_tags).
-- These STABLE SECURITY DEFINER helpers run as the migration owner (which is not
-- subject to RLS) and only ever return a boolean for the id passed in, so they
-- break the recursion and keep the policy cost index-friendly. `search_path` is
-- emptied to make name resolution unambiguous.
CREATE OR REPLACE FUNCTION public.entity_is_public(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.id = p_entity_id AND e.is_public IS TRUE
  );
$$;

-- A content row is public when it is tagged (via content_tags) to any public
-- entity. This is the "signals/content reachable from public entities" rule.
CREATE OR REPLACE FUNCTION public.content_is_public(p_content_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.content_tags ct
    JOIN public.entities e ON e.id = ct.entity_id
    WHERE ct.content_id = p_content_id AND e.is_public IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_entity(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.watchlists w
           WHERE w.entity_id = p_entity_id AND w.user_id = auth.uid()
         )
      OR EXISTS (
           SELECT 1 FROM public.alert_events ae
           WHERE ae.entity_id = p_entity_id AND ae.user_id = auth.uid()
         );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_signal(p_signal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alert_events ae
    WHERE ae.signal_id = p_signal_id AND ae.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_content(p_content_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.alert_events ae
    JOIN public.signals s ON s.id = ae.signal_id
    WHERE s.content_id = p_content_id AND ae.user_id = auth.uid()
  );
$$;

-- The policies call these as the querying role, so anon/authenticated need
-- EXECUTE. Nothing else does (service_role bypasses RLS), and PUBLIC is revoked
-- so the helper surface is explicit.
REVOKE ALL ON FUNCTION public.entity_is_public(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_is_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_entity(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_signal(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_content(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_is_public(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_is_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_entity(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_signal(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_content(uuid) TO anon, authenticated;

-- ── 3. Supporting indexes for policy performance ─────────────────────────────
-- content_is_public(): content_tags WHERE content_id = ? AND entity_id → ?
CREATE INDEX IF NOT EXISTS idx_content_tags_content_entity
  ON content_tags (content_id, entity_id);
-- user_owns_entity(): alert_events WHERE user_id = auth.uid() AND entity_id = ?
-- (watchlists already has UNIQUE(user_id, entity_id); alert_events does not.)
CREATE INDEX IF NOT EXISTS idx_alert_events_user_entity
  ON alert_events (user_id, entity_id);

-- ── 4. entities ──────────────────────────────────────────────────────────────
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entities_public_read" ON entities;
CREATE POLICY "entities_public_read"
  ON entities FOR SELECT
  TO anon, authenticated
  USING (public.entity_is_public(id));

DROP POLICY IF EXISTS "entities_owner_read" ON entities;
CREATE POLICY "entities_owner_read"
  ON entities FOR SELECT
  TO authenticated
  USING (public.user_owns_entity(id));

-- ── 5. signals ───────────────────────────────────────────────────────────────
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signals_public_read" ON signals;
CREATE POLICY "signals_public_read"
  ON signals FOR SELECT
  TO anon, authenticated
  USING (public.content_is_public(content_id));

DROP POLICY IF EXISTS "signals_owner_read" ON signals;
CREATE POLICY "signals_owner_read"
  ON signals FOR SELECT
  TO authenticated
  USING (public.user_owns_signal(id));

-- ── 6. content ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "content_public_read" ON content;
CREATE POLICY "content_public_read"
  ON content FOR SELECT
  TO anon, authenticated
  USING (public.content_is_public(id));

DROP POLICY IF EXISTS "content_owner_read" ON content;
CREATE POLICY "content_owner_read"
  ON content FOR SELECT
  TO authenticated
  USING (public.user_owns_content(id));

-- ── 7. content_tags ──────────────────────────────────────────────────────────
-- Readable when its content is public OR the tag points at a public entity.
DROP POLICY IF EXISTS "content_tags_public_read" ON content_tags;
CREATE POLICY "content_tags_public_read"
  ON content_tags FOR SELECT
  TO anon, authenticated
  USING (
    public.content_is_public(content_id)
    OR public.entity_is_public(entity_id)
  );

-- ── 8. entity_aliases ────────────────────────────────────────────────────────
-- Aliases reveal entity names, so they follow the same rule as the entity.
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_aliases_public_read" ON entity_aliases;
CREATE POLICY "entity_aliases_public_read"
  ON entity_aliases FOR SELECT
  TO anon, authenticated
  USING (public.entity_is_public(entity_id));

DROP POLICY IF EXISTS "entity_aliases_owner_read" ON entity_aliases;
CREATE POLICY "entity_aliases_owner_read"
  ON entity_aliases FOR SELECT
  TO authenticated
  USING (public.user_owns_entity(entity_id));

-- No INSERT/UPDATE/DELETE policies are granted to anon/authenticated on any of
-- these tables: all writes in the app go through service_role (ingestion,
-- admin), which bypasses RLS. Dropping the old FOR ALL policy removes the
-- previously-granted blanket write access too.

-- ============================================================================
-- DOWN / ROLLBACK — uncomment everything below to revert to the pre-020 state.
-- Restores the blanket permissive policies (read/write for everyone) that this
-- migration removed. NOTE: content / content_tags never had a tracked policy, so
-- their rollback DISABLEs RLS (their true pre-020 state) — if the live DB had an
-- untracked policy there, recreate it instead of relying on the DISABLE.
-- ============================================================================
/*
BEGIN;

DROP POLICY IF EXISTS "entities_public_read" ON entities;
DROP POLICY IF EXISTS "entities_owner_read" ON entities;
DROP POLICY IF EXISTS "signals_public_read" ON signals;
DROP POLICY IF EXISTS "signals_owner_read" ON signals;
DROP POLICY IF EXISTS "content_public_read" ON content;
DROP POLICY IF EXISTS "content_owner_read" ON content;
DROP POLICY IF EXISTS "content_tags_public_read" ON content_tags;
DROP POLICY IF EXISTS "entity_aliases_public_read" ON entity_aliases;
DROP POLICY IF EXISTS "entity_aliases_owner_read" ON entity_aliases;

DROP INDEX IF EXISTS public.idx_content_tags_content_entity;
DROP INDEX IF EXISTS public.idx_alert_events_user_entity;

DROP FUNCTION IF EXISTS public.entity_is_public(uuid);
DROP FUNCTION IF EXISTS public.content_is_public(uuid);
DROP FUNCTION IF EXISTS public.user_owns_entity(uuid);
DROP FUNCTION IF EXISTS public.user_owns_signal(uuid);
DROP FUNCTION IF EXISTS public.user_owns_content(uuid);

-- Restore the pre-020 blanket policies.
CREATE POLICY "Service role full access" ON entities
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON signals
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON entity_aliases
  FOR ALL USING (true) WITH CHECK (true);

-- content / content_tags were a pre-003 baseline with no tracked RLS.
ALTER TABLE content      DISABLE ROW LEVEL SECURITY;
ALTER TABLE content_tags DISABLE ROW LEVEL SECURITY;

COMMIT;
*/
