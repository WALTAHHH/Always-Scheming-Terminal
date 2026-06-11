-- Migration 010: add ir_url + sec_url + segment + market_cap_b to entities
-- These fields were previously only in the companies.ts static file.
-- Now stored in DB so CompanyDrawer can pull them via /api/v1/entities.

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS ir_url text,
  ADD COLUMN IF NOT EXISTS sec_url text,
  ADD COLUMN IF NOT EXISTS segment text,
  ADD COLUMN IF NOT EXISTS market_cap_b numeric;
