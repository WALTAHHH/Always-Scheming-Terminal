-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create an IVFFlat index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_content_embedding ON content USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Function to perform vector similarity search with optional filters
CREATE OR REPLACE FUNCTION match_content(
  query_embedding vector(768),
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