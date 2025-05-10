-- Migration: Add real-time frame analysis support
-- 2024-05-23

DROP TRIGGER IF EXISTS scratch_item_inserted_trigger ON public.scratch_items;
-- DROP POLICY "Users can access their own scratch items" ON public.scratch_items;
-- DROP POLICY "Users can insert scratch items for their own assets" ON public.scratch_items;
-- DROP POLICY "Users can delete their own scratch items" ON public.scratch_items;
DROP INDEX IF EXISTS idx_scratch_items_asset;


-- Create scratch_items table for storing frame analysis data
DROP TABLE IF EXISTS public.scratch_items;
CREATE TABLE IF NOT EXISTS public.scratch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Item identification and description
  caption TEXT NOT NULL,
  description TEXT,
  category TEXT,
  
  -- Value estimation
  estimated_value NUMERIC,
  confidence REAL,
  
  -- Media reference
  image_url TEXT NOT NULL,
  
  -- Location in frame
  bounding_box JSON,
  
  -- Position within sequence
  sequence_order INTEGER
);

-- Enable Row Level Security (RLS) for scratch_items if needed in the future,
-- but without asset_id, the previous policies are not applicable.
-- For now, RLS is enabled, but no specific policies are applied that depend on asset_id.
ALTER TABLE public.scratch_items ENABLE ROW LEVEL SECURITY;

-- The following RLS policies are removed as they depend on the asset_id column,
-- which has been removed from scratch_items.
-- CREATE POLICY "Users can access their own scratch items" 
-- ON public.scratch_items
-- FOR SELECT 
-- USING (auth.uid() IN (SELECT user_id FROM public.assets WHERE id = scratch_items.asset_id));

-- CREATE POLICY "Users can insert scratch items for their own assets" 
-- ON public.scratch_items
-- FOR INSERT 
-- WITH CHECK (auth.uid() IN (SELECT user_id FROM public.assets WHERE id = scratch_items.asset_id));

-- CREATE POLICY "Users can delete their own scratch items" 
-- ON public.scratch_items
-- FOR DELETE 
-- USING (auth.uid() IN (SELECT user_id FROM public.assets WHERE id = scratch_items.asset_id));

-- Note: If RLS is required for scratch_items based on user, 
-- a user_id or session_id column directly in scratch_items would be needed.

-- The index on asset_id is removed as the column is removed.
-- CREATE INDEX IF NOT EXISTS idx_scratch_items_asset ON public.scratch_items(asset_id);

-- Add frame analysis tracking fields to assets table
ALTER TABLE IF EXISTS public.assets 
ADD COLUMN IF NOT EXISTS frame_analysis_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS frame_analysis_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS frame_analysis_completed_at TIMESTAMPTZ;

-- Add notification function for realtime updates
-- asset_id is removed from the payload
CREATE OR REPLACE FUNCTION notify_scratch_item_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('scratch_item_inserted', json_build_object(
    'id', NEW.id,
    -- 'asset_id', NEW.asset_id, -- asset_id removed
    'caption', NEW.caption,
    'estimated_value', NEW.estimated_value
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to fire notification on insert
CREATE TRIGGER scratch_item_inserted_trigger
AFTER INSERT ON public.scratch_items
FOR EACH ROW
EXECUTE FUNCTION notify_scratch_item_inserted();
