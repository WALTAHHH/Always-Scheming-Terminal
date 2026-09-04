-- 013: Add importance_score to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS importance_score float;
CREATE INDEX IF NOT EXISTS idx_content_importance ON content(importance_score DESC NULLS LAST);
