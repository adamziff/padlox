-- Run this script in the Supabase SQL editor to add Mux fields to your assets table
-- This script is idempotent and can be run multiple times safely

-- Add Mux-specific fields to the assets table
ALTER TABLE assets
ADD COLUMN IF NOT EXISTS mux_asset_id VARCHAR,
ADD COLUMN IF NOT EXISTS mux_playback_id VARCHAR,
ADD COLUMN IF NOT EXISTS mux_processing_status VARCHAR,
ADD COLUMN IF NOT EXISTS mux_max_resolution VARCHAR,
ADD COLUMN IF NOT EXISTS mux_aspect_ratio VARCHAR,
ADD COLUMN IF NOT EXISTS mux_duration FLOAT;

-- Create an index on mux_asset_id for faster lookups when webhooks arrive
CREATE INDEX IF NOT EXISTS idx_assets_mux_asset_id ON assets(mux_asset_id);

-- Create a policy to ensure users can only access their own videos
CREATE POLICY IF NOT EXISTS "Users can only access their own videos" 
ON assets 
FOR ALL 
USING (auth.uid() = user_id);

-- Verify the changes were applied successfully
SELECT 
  column_name, 
  data_type 
FROM 
  information_schema.columns 
WHERE 
  table_name = 'assets' AND 
  column_name LIKE 'mux_%';

-- Show indexes on the assets table
SELECT
  indexname,
  indexdef
FROM
  pg_indexes
WHERE
  tablename = 'assets' AND
  indexname LIKE '%mux%'; 