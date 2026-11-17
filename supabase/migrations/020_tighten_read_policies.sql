-- 020: Close the open PostgREST read surface on entity / reference tables
-- (review finding #3)
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
-- ── Semantic correction: is_public is NOT a visibility flag ──────────────────
-- An earlier draft of this migration gated reads on `entities.is_public = true`.
-- That is WRONG. `entities.is_public` (migration 004) means **publicly traded**
-- — it drives the admin page PUBLIC/PRIVATE badge and whether a ticker is shown
-- — NOT whether an entity is visible to users. Users must be able to follow and
-- watch non-public companies (Valve, Epic, ...), and content tagged only to
-- them must keep resolving in the watchlist / alert embeds. Gating on
-- `is_public` would hide those entities and null out their embeds. This
-- migration therefore does not reference `is_public` at all.
--
-- ── Model ────────────────────────────────────────────────────────────────────
--   * `authenticated` may SELECT all rows (`USING (true)`) on entities,
--     entity_aliases, signals, content and content_tags. These are reference /
--     product data; nearly every app server route already reads them on the
--     service-role client and bypasses RLS anyway. No ownership or
--     public-trading predicate is applied.
--   * `anon` gets NO policy on these tables → zero rows through PostgREST even
--     though the table-level GRANT remains. This is the actual fix for finding
--     #3: the anon key must not be able to dump whole tables.
--   * `service_role` has BYPASSRLS and is unaffected (ingestion, cron, admin,
--     and every server route).
--   * No INSERT/UPDATE/DELETE policies are granted to anon/authenticated on any
--     of these tables: all writes go through service_role. Dropping the old
--     FOR ALL policy also removes its blanket write access.
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
-- Tightening RLS closes the DIRECT PostgREST vector. It does NOT change the
-- app's own output, because nearly every reader runs on the service_role key and
-- bypasses RLS (docs/rls-read-path-inventory.md §3a/§5A). The following public,
-- unauthenticated service-role routes therefore still return ALL
-- content/signals/entities regardless of these policies. Whether they should be
-- filtered is a PRODUCT decision and is intentionally NOT changed here:
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
-- ── No app-code changes needed ───────────────────────────────────────────────
-- `authenticated` keeps full SELECT on all five tables, so no server route needs
-- to move to the service-role client because of this migration. (An earlier
-- draft changed src/app/api/tags/themes/route.ts for that reason; that change
-- has been dropped — the route stays on the auth-scoped client.)
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
-- expression, not by name — so naming drift cannot leave a hole behind. It also
-- removes the policies created by earlier drafts of this same migration, which
-- are re-created at the end of this file.
--
-- Safe to re-run.

-- ── 0. Drop the policies created by earlier drafts of 020 ────────────────────
-- The previous draft gated reads on entities.is_public; those policies do not
-- match the USING(true) expression match below, so drop them by name first.
DROP POLICY IF EXISTS "entities_public_read"        ON entities;
DROP POLICY IF EXISTS "entities_owner_read"         ON entities;
DROP POLICY IF EXISTS "signals_public_read"         ON signals;
DROP POLICY IF EXISTS "signals_owner_read"          ON signals;
DROP POLICY IF EXISTS "content_public_read"         ON content;
DROP POLICY IF EXISTS "content_owner_read"          ON content;
DROP POLICY IF EXISTS "content_tags_public_read"    ON content_tags;
DROP POLICY IF EXISTS "entity_aliases_public_read"  ON entity_aliases;
DROP POLICY IF EXISTS "entity_aliases_owner_read"   ON entity_aliases;

-- ── 1. Drop every blanket USING(true) policy on the in-scope tables ──────────
-- Names on the live DB are only partly known ("Service role full access" on
-- entities/signals/entity_aliases). Match by expression so content/content_tags
-- are covered too, and so a renamed-but-still-`true` policy can't survive.
-- This also clears the authenticated policies this migration creates, so a
-- re-run is a clean drop+recreate.
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

-- ── 2. Remove the helper functions from the earlier draft ────────────────────
-- entity_is_public() / content_is_public() encoded the WRONG semantics
-- (is_public = visibility). user_owns_*() are no longer needed now that the
-- authenticated read is not ownership-scoped. Grep confirms nothing else in the
-- repo references them. Dropping a function drops its grants too.
DROP FUNCTION IF EXISTS public.entity_is_public(uuid);
DROP FUNCTION IF EXISTS public.content_is_public(uuid);
DROP FUNCTION IF EXISTS public.user_owns_entity(uuid);
DROP FUNCTION IF EXISTS public.user_owns_signal(uuid);
DROP FUNCTION IF EXISTS public.user_owns_content(uuid);

-- Indexes that only existed to make those helper predicates cheap. Dropping
-- them keeps the schema honest; they are re-created by the rollback block only
-- if the blanket policies are restored.
DROP INDEX IF EXISTS public.idx_content_tags_content_entity;
DROP INDEX IF EXISTS public.idx_alert_events_user_entity;

-- ── 3. Enable RLS on the tables that never had a tracked policy ──────────────
-- Idempotent; enabling RLS on `content`/`content_tags` is what actually closes
-- the read exposure for the pre-003 baseline tables. RLS is already enabled on
-- entities/signals/entity_aliases (004/005/007), but repeat it so a partially
-- provisioned database converges.
ALTER TABLE entities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE content        ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_tags   ENABLE ROW LEVEL SECURITY;

-- ── 4. SELECT policies: authenticated only, no is_public predicate ───────────
-- Reference / product data. An authenticated user may read every row, including
-- entities with is_public = false or NULL. `anon` is deliberately absent: with
-- RLS enabled and no anon policy, PostgREST returns zero rows for the anon key.

DROP POLICY IF EXISTS "entities_authenticated_read" ON entities;
CREATE POLICY "entities_authenticated_read"
  ON entities FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "entity_aliases_authenticated_read" ON entity_aliases;
CREATE POLICY "entity_aliases_authenticated_read"
  ON entity_aliases FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "signals_authenticated_read" ON signals;
CREATE POLICY "signals_authenticated_read"
  ON signals FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "content_authenticated_read" ON content;
CREATE POLICY "content_authenticated_read"
  ON content FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "content_tags_authenticated_read" ON content_tags;
CREATE POLICY "content_tags_authenticated_read"
  ON content_tags FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies are granted to anon/authenticated on any of
-- these tables: all writes in the app go through service_role (ingestion,
-- admin), which bypasses RLS.

-- ============================================================================
-- DOWN / ROLLBACK — uncomment everything below to revert to the pre-020 state.
-- Restores the blanket permissive policies (read/write for everyone) that this
-- migration removed. NOTE: content / content_tags never had a tracked policy, so
-- their rollback DISABLEs RLS (their true pre-020 state) — if the live DB had an
-- untracked policy there, recreate it instead of relying on the DISABLE.
-- ============================================================================
/*
BEGIN;

DROP POLICY IF EXISTS "entities_authenticated_read"       ON entities;
DROP POLICY IF EXISTS "entity_aliases_authenticated_read" ON entity_aliases;
DROP POLICY IF EXISTS "signals_authenticated_read"        ON signals;
DROP POLICY IF EXISTS "content_authenticated_read"        ON content;
DROP POLICY IF EXISTS "content_tags_authenticated_read"   ON content_tags;

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
