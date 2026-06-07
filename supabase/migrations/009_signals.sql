-- 004: Signals table for extracted investment signals
-- Stores structured signals extracted from items via LLM

-- ── Signals table ─────────────────────────────────────────────
CREATE TABLE signals (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id                   uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  signal_type               text NOT NULL CHECK (signal_type IN (
                              'acquisition','fundraising','earnings','layoffs',
                              'leadership','product_launch','regulatory','platform_change','macro'
                            )),
  summary                   text NOT NULL,
  investment_relevance_score float NOT NULL CHECK (investment_relevance_score >= 0 AND investment_relevance_score <= 1),
  raw_llm_output            jsonb,
  model_used                text,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX idx_signals_item ON signals(item_id);
CREATE INDEX idx_signals_type ON signals(signal_type);
CREATE INDEX idx_signals_score ON signals(investment_relevance_score DESC);
CREATE INDEX idx_signals_created ON signals(created_at DESC);

-- ── RLS (match existing pattern — service role only) ───────────
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (matches sources/items pattern)
CREATE POLICY "Service role full access" ON signals
  FOR ALL USING (true) WITH CHECK (true);
