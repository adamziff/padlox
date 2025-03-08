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

-- Check if the policy already exists before creating it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'assets' 
        AND policyname = 'Users can only access their own videos'
    ) THEN
        -- Create a policy to ensure users can only access their own videos
        EXECUTE 'CREATE POLICY "Users can only access their own videos" ON assets FOR ALL USING (auth.uid() = user_id)';
    END IF;
END
$$; 