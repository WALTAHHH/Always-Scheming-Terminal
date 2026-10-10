-- 017: create allowed_emails table for invite-only signup gate
-- This table holds emails that are allowed to sign up (private beta).
-- RLS is disabled so only service role can read/write.

CREATE TABLE IF NOT EXISTS allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Ensure row-level security is disabled (service role only)
ALTER TABLE allowed_emails DISABLE ROW LEVEL SECURITY;