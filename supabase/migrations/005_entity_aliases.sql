-- 005: Entity aliases table
-- The deduplication layer for entity name resolution

CREATE TABLE entity_aliases (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  alias_type  text NOT NULL CHECK (alias_type IN (
                'canonical', 'ticker', 'common', 'game_title',
                'abbreviation', 'former_name', 'product'
              )),
  UNIQUE (alias)  -- one alias maps to exactly one entity
);

CREATE INDEX idx_entity_aliases_alias ON entity_aliases(lower(alias));
CREATE INDEX idx_entity_aliases_entity ON entity_aliases(entity_id);

-- RLS (match existing pattern — service role only)
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON entity_aliases
  FOR ALL USING (true) WITH CHECK (true);
