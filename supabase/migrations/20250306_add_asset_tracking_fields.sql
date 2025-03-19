-- Create a table to store Mux webhook events
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    event_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false NOT NULL,
    processed_at TIMESTAMPTZ,
    mux_asset_id TEXT,
    mux_upload_id TEXT,
    processing_error TEXT
);

-- Migration to add new tracking fields to assets table
-- This helps with reliability when page refreshes happen during video uploads

-- Add client_reference_id column for tracking assets across page refreshes
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS client_reference_id VARCHAR;

-- Add mux_correlation_id column to match with Mux webhook metadata
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS mux_correlation_id VARCHAR;

-- Add last_updated column for tracking when assets were last modified
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT now();

-- Add index on client_reference_id for faster lookups during recovery
CREATE INDEX IF NOT EXISTS idx_assets_client_reference_id ON public.assets(client_reference_id);

-- Add index on mux_correlation_id for faster lookups from webhooks
CREATE INDEX IF NOT EXISTS idx_assets_mux_correlation_id ON public.assets(mux_correlation_id);

-- Update webhook_events table to include correlation ID
ALTER TABLE public.webhook_events
ADD COLUMN IF NOT EXISTS mux_correlation_id VARCHAR;

-- Add asset_id column to webhook_events for tracking which asset was updated
ALTER TABLE public.webhook_events
ADD COLUMN IF NOT EXISTS asset_id UUID;

-- Add index on mux_correlation_id in webhook_events
CREATE INDEX IF NOT EXISTS idx_webhook_events_mux_correlation_id ON webhook_events(mux_correlation_id);

-- Add index on asset_id in webhook_events
CREATE INDEX IF NOT EXISTS idx_webhook_events_asset_id ON webhook_events(asset_id);

-- Add a trigger to automatically update last_updated whenever an asset is modified
CREATE OR REPLACE FUNCTION public.update_asset_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists to avoid errors when re-running the migration
DROP TRIGGER IF EXISTS update_asset_timestamp ON public.assets;

-- Create the trigger to automatically update last_updated
CREATE TRIGGER update_asset_timestamp
BEFORE UPDATE ON public.assets
FOR EACH ROW
EXECUTE PROCEDURE public.update_asset_timestamp(); 