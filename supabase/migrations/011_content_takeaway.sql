-- Add takeaway field to content table
-- Stores AI-extracted one-liner investment signal

ALTER TABLE content ADD COLUMN IF NOT EXISTS takeaway text;
