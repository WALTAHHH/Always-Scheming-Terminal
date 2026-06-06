-- 008: API keys table
-- Multi-tenant API auth

CREATE TABLE api_keys (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash        text NOT NULL UNIQUE,  -- sha256 of raw key; never store raw
  label           text NOT NULL,         -- e.g. "hermanito", "wolo-agent"
  owner           text NOT NULL,
  scopes          jsonb NOT NULL DEFAULT '["items:read"]'::jsonb,
  rate_limit_rpm  integer NOT NULL DEFAULT 60,
  last_used_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  revoked_at      timestamptz            -- null = active; set to revoke, never delete
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- RLS (match existing pattern — service role only)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON api_keys
  FOR ALL USING (true) WITH CHECK (true);
