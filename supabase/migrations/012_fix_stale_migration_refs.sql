-- Fix: 006 referenced item_tags (old name). Add entity_id to content_tags if not already present.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_tags' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE content_tags ADD COLUMN entity_id uuid REFERENCES entities(id) ON DELETE SET NULL;
    CREATE INDEX idx_content_tags_entity ON content_tags(entity_id) WHERE entity_id IS NOT NULL;
  END IF;
END $$;

-- Fix: 007 referenced items(id). If signals.item_id FK points to wrong table, recreate it.
-- (If signals table already exists correctly, this is a no-op)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signals')
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'signals' AND ccu.table_name = 'content'
  ) THEN
    -- FK points to wrong table, drop and recreate
    ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_item_id_fkey;
    ALTER TABLE signals ADD CONSTRAINT signals_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES content(id) ON DELETE CASCADE;
  END IF;
END $$;
