-- 016: update embedding column and match_content to vector(1536)
-- Background: column was created at vector(1536) in production (015 was never applied live).
-- This migration aligns the codebase with production and updates match_content to match.

ALTER TABLE content ALTER COLUMN embedding TYPE vector(1536);

DROP INDEX IF EXISTS idx_content_embedding;
CREATE INDEX IF NOT EXISTS idx_content_embedding ON content USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_content(
  query_embedding vector(1536),
  match_limit int DEFAULT 5,
  date_from timestamptz DEFAULT NULL,
  entity_value text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  body text,
  url text,
  published_at timestamptz,
  signal_type text,
  summary text
)
LANGUAGE sql
AS $$
  SELECT c.id, c.title, c.body, c.url, c.published_at, s.signal_type, s.summary
  FROM content c
  LEFT JOIN signals s ON s.content_id = c.id
  WHERE (entity_value IS NULL OR EXISTS (
    SELECT 1 FROM content_tags ct
    WHERE ct.content_id = c.id
    AND ct.dimension = 'company'
    AND ct.value = entity_value
  ))
  AND (date_from IS NULL OR c.published_at >= date_from)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_limit;
$$;
