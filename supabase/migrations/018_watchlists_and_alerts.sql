-- 018: Watchlists + alerts
-- Per-entity follows and the per-user alert ledger (dedup + unread badge source).
-- Draft authored per docs/specs/watchlists-alerts.md §2, incorporating Matt's decisions:
--   * default watchlist_min_score = 0.75 (not 0.65)
--   * weekly email digest cadence -> user_preferences.last_digest_sent_at
--   * one-click unsubscribe -> user_preferences.digest_unsub_token
-- This migration is NOT applied by the worker; Matt applies it out-of-band.

-- ── watchlists ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id   uuid NOT NULL REFERENCES entities(id)  ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, entity_id)          -- idempotent follow; one row per pair
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user   ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_entity ON watchlists(entity_id);

-- RLS: same pattern as user_preferences — owner-only, all verbs.
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watchlists"
  ON watchlists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── alert_events ──────────────────────────────────────────────
-- One row per (user, signal) a user should be told about. The UNIQUE constraint
-- is the dedup guarantee: a user is alerted at most once per signal, ever.
CREATE TABLE IF NOT EXISTS alert_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id         uuid NOT NULL REFERENCES signals(id)   ON DELETE CASCADE,
  -- which watch triggered it (nullable: watch may be removed later)
  watchlist_id      uuid REFERENCES watchlists(id) ON DELETE SET NULL,
  entity_id         uuid REFERENCES entities(id)   ON DELETE SET NULL,
  signal_type       text NOT NULL,
  score             numeric NOT NULL,        -- snapshot of investment_relevance_score
  created_at        timestamptz DEFAULT now(),
  read_at           timestamptz,             -- NULL = unread (drives the badge)
  email_sent_at     timestamptz,             -- NULL = not yet in a digest
  UNIQUE (user_id, signal_id)                -- ← dedup: never twice for the same signal
);

CREATE INDEX IF NOT EXISTS idx_alert_events_user_unread
  ON alert_events(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alert_events_email
  ON alert_events(user_id, created_at DESC) WHERE email_sent_at IS NULL;

-- RLS: users read/mark-read their own alerts. Inserts arrive via the service role
-- (which bypasses RLS), so no INSERT policy is needed for end users.
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own alerts"
  ON alert_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users mark own alerts read"
  ON alert_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── per-user threshold + weekly digest bookkeeping ────────────
-- Extend the existing table rather than add a new one.
--   watchlist_min_score    : gates which signals qualify (0..1, default 0.75)
--   last_digest_sent_at    : weekly cadence check in the cron tail
--   digest_unsub_token     : one-click unsubscribe token (unique when set)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS watchlist_min_score numeric NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS digest_unsub_token text;

-- Unsubscribe tokens must be unique across users; partial index so multiple
-- NULLs (users who never received a digest) are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_digest_unsub_token
  ON user_preferences(digest_unsub_token) WHERE digest_unsub_token IS NOT NULL;

-- Extend the notification_prefs default to advertise the new watchlist channel
-- toggle (existing rows keep their blob; the app merges keys defensively).
ALTER TABLE user_preferences
  ALTER COLUMN notification_prefs
  SET DEFAULT '{"digest": false, "breaking": false, "watchlist_email": false}'::jsonb;
