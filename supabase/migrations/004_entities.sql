-- 004: Entities table
-- Replaces companies table with type-aware entity model

CREATE TABLE entities (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_name  text NOT NULL UNIQUE,
  entity_type     text NOT NULL CHECK (entity_type IN (
                    'company', 'person', 'game', 'event', 'org'
                  )),
  ticker          text,
  exchange        text,
  is_public       boolean DEFAULT false,
  parent_id       uuid REFERENCES entities(id) ON DELETE SET NULL,
  description     text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_ticker ON entities(ticker) WHERE ticker IS NOT NULL;

-- RLS (match existing pattern — service role only)
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON entities
  FOR ALL USING (true) WITH CHECK (true);
