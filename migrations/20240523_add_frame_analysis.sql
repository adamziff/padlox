-- Migration: Add real-time frame analysis support
-- 2024-05-23

-- Create scratch_items table for storing frame analysis data
CREATE TABLE IF NOT EXISTS public.scratch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caption TEXT,
  image_url TEXT NOT NULL,
  confidence REAL
);

-- Add index for quick lookups by asset
CREATE INDEX IF NOT EXISTS idx_scratch_items_asset ON public.scratch_items(asset_id);

-- Add frame analysis tracking fields to assets table
ALTER TABLE IF EXISTS public.assets 
ADD COLUMN IF NOT EXISTS frame_analysis_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS frame_analysis_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS frame_analysis_completed_at TIMESTAMPTZ;

-- Add realtime notification function for scratch items
CREATE OR REPLACE FUNCTION public.notify_scratch_item_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'scratch_item_inserted',
    json_build_object(
      'id', NEW.id,
      'asset_id', NEW.asset_id,
      'captured_at', NEW.captured_at,
      'caption', NEW.caption,
      'image_url', NEW.image_url,
      'confidence', NEW.confidence
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for scratch item notifications
DROP TRIGGER IF EXISTS scratch_item_inserted_trigger ON public.scratch_items;
CREATE TRIGGER scratch_item_inserted_trigger
AFTER INSERT ON public.scratch_items
FOR EACH ROW
EXECUTE FUNCTION public.notify_scratch_item_inserted();

-- Add function to mark frame analysis complete
CREATE OR REPLACE FUNCTION public.mark_frame_analysis_complete(p_asset_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.assets
  SET 
    frame_analysis_complete = TRUE,
    frame_analysis_completed_at = now()
  WHERE id = p_asset_id;
  
  -- Broadcast completion event
  INSERT INTO public.broadcast (channel, event, payload)
  VALUES (
    'asset_' || p_asset_id,
    'frame_analysis_complete',
    json_build_object(
      'asset_id', p_asset_id,
      'completed_at', now()
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Add function to initiate frame analysis and update status
CREATE OR REPLACE FUNCTION public.initiate_frame_analysis(p_asset_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.assets
  SET 
    frame_analysis_complete = FALSE,
    frame_analysis_started_at = now()
  WHERE id = p_asset_id;
  
  -- Broadcast initiation event
  INSERT INTO public.broadcast (channel, event, payload)
  VALUES (
    'asset_' || p_asset_id,
    'frame_analysis_started',
    json_build_object(
      'asset_id', p_asset_id,
      'started_at', now()
    )
  );
END;
$$ LANGUAGE plpgsql; 