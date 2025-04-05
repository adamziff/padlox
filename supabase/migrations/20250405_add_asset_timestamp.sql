-- Migration to add item support and related fields to the assets table

-- Step 1: Update the CHECK constraint for media_type

-- IMPORTANT: Find the existing check constraint name for assets.media_type first!
-- Execute this command in your Supabase SQL editor:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.assets'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%media_type%';
-- Note the constraint name (e.g., assets_media_type_check) and use it below.

-- Drop the old constraint (Replace 'assets_media_type_check' with the actual name found)
ALTER TABLE public.assets
DROP CONSTRAINT IF EXISTS assets_media_type_check; -- <<< REPLACE constraint_name HERE if different

-- Add the new constraint including 'item'
ALTER TABLE public.assets
ADD CONSTRAINT assets_media_type_check CHECK (media_type IN ('image', 'video', 'item'));

-- Step 2: Add new columns for item tracking

-- Add columns only if they don't already exist
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS is_source_video BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS source_video_id UUID REFERENCES public.assets(id) ON DELETE SET NULL, -- Setting to NULL if source video is deleted
ADD COLUMN IF NOT EXISTS item_timestamp DOUBLE PRECISION;

-- Step 3: Add an index for faster lookup

-- Add index only if it doesn't already exist
CREATE INDEX IF NOT EXISTS idx_assets_source_video_id ON public.assets (source_video_id);

-- Optional Step 4: Backfill is_source_video for existing videos (run manually if needed)
-- This ensures existing videos are correctly marked as source videos.
-- UPDATE public.assets
-- SET is_source_video = true
-- WHERE media_type = 'video' AND is_source_video IS false;
