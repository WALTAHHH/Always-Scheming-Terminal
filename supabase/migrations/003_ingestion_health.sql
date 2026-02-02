-- 003: Ingestion health monitoring
-- Adds ingestion_logs table + error tracking columns on sources

-- ── Ingestion Logs ─────────────────────────────────────────────
CREATE TABLE ingestion_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid REFERENCES sources(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  fetched integer DEFAULT 0,
  inserted integer DEFAULT 0,
  errors text[] DEFAULT '{}',
  success boolean DEFAULT true,
  duration_ms integer DEFAULT 0
);

CREATE INDEX idx_ingestion_logs_source ON ingestion_logs(source_id, started_at DESC);
CREATE INDEX idx_ingestion_logs_started ON ingestion_logs(started_at DESC);

-- ── Error tracking on sources ──────────────────────────────────
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_errors integer DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

-- Backfill last_success_at from last_fetched_at for existing sources
UPDATE sources SET last_success_at = last_fetched_at WHERE last_fetched_at IS NOT NULL;

-- ── RLS (match existing pattern — service role only) ───────────
ALTER TABLE ingestion_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (matches sources/items pattern)
CREATE POLICY "Service role full access" ON ingestion_logs
  FOR ALL USING (true) WITH CHECK (true);
