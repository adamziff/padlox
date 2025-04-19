-- Add is_processed column to assets table if it doesn't exist
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;