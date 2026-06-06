-- 006: Add entity_id FK to item_tags
-- Links company tags to canonical entities

ALTER TABLE item_tags
  ADD COLUMN entity_id uuid REFERENCES entities(id) ON DELETE SET NULL;

CREATE INDEX idx_item_tags_entity ON item_tags(entity_id) WHERE entity_id IS NOT NULL;
