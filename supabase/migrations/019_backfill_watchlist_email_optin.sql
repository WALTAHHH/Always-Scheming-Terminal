-- 019: Backfill `notification_prefs.watchlist_email` for the opt-in digest
--
-- The weekly watchlist digest is opt-in: `isDigestEnabled` (src/lib/alerts.ts)
-- now sends only when `notification_prefs.watchlist_email === true`. Before
-- this change the gate was opt-out — a *missing* `watchlist_email` key counted
-- as enabled — so every pre-migration row would have kept receiving the digest
-- even though the profile toggle showed OFF.
--
-- This data fix makes the stored state agree with the new semantics: every row
-- whose blob lacks `watchlist_email` is set to `false` (disabled). Users are
-- then only emailed once they explicitly flip the toggle on (which writes
-- `watchlist_email: true`). We intentionally do NOT promote a legacy
-- `digest: true` value — nobody opted in to `watchlist_email`, so nobody should
-- start (or keep) getting mail from a backfill.
--
-- Idempotent: re-running only touches rows that still lack the key, and
-- `jsonb_set(..., create_if_missing => true)` creates it when absent.
-- Safe on an empty / not-yet-created table is NOT guaranteed — apply after
-- migration 011 (user_preferences) has created the table.

UPDATE user_preferences
SET notification_prefs = jsonb_set(
      COALESCE(notification_prefs, '{}'::jsonb),
      '{watchlist_email}',
      'false'::jsonb,
      true
    )
WHERE notification_prefs IS NULL
   OR NOT (notification_prefs ? 'watchlist_email');
