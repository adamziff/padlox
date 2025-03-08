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

-- Create an index on mux_asset_id
CREATE INDEX IF NOT EXISTS idx_webhook_events_mux_asset_id ON webhook_events(mux_asset_id);

-- Create an index on mux_upload_id
CREATE INDEX IF NOT EXISTS idx_webhook_events_mux_upload_id ON webhook_events(mux_upload_id);

-- Create an index on processed status
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- Create a function to process pending webhook events
CREATE OR REPLACE FUNCTION public.process_pending_webhooks(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- This function runs with the permissions of the creator
AS $$
DECLARE
    result JSONB;
    processed_count INTEGER := 0;
    update_count INTEGER := 0;
    event_record RECORD;
BEGIN
    -- Find pending webhook events that have mux_upload_id
    FOR event_record IN 
        SELECT 
            we.id as webhook_id, 
            we.event_type, 
            we.mux_asset_id,
            we.mux_upload_id,
            we.payload
        FROM 
            webhook_events we
        WHERE 
            we.processed = false
            AND we.event_type = 'video.asset.ready'
            AND we.mux_upload_id IS NOT NULL
        ORDER BY 
            we.created_at DESC
        LIMIT 100
    LOOP
        BEGIN
            -- Try to find an asset with matching mux_asset_id
            UPDATE assets
            SET 
                mux_processing_status = 'ready',
                mux_playback_id = (event_record.payload->'data'->'playback_ids'->0->>'id'),
                mux_max_resolution = (event_record.payload->'data'->>'max_stored_resolution'),
                mux_aspect_ratio = (event_record.payload->'data'->>'aspect_ratio'),
                mux_duration = (event_record.payload->'data'->>'duration')::FLOAT,
                media_url = 'https://stream.mux.com/' || (event_record.payload->'data'->'playback_ids'->0->>'id') || '.m3u8',
                mux_asset_id = event_record.mux_asset_id
            WHERE 
                mux_asset_id = event_record.mux_upload_id
                AND user_id = process_pending_webhooks.user_id; -- Only update user's own assets
                
            GET DIAGNOSTICS update_count = ROW_COUNT;
            
            -- Mark this webhook as processed
            UPDATE webhook_events
            SET 
                processed = true,
                processed_at = NOW()
            WHERE id = event_record.webhook_id;
            
            processed_count := processed_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Mark as errored
            UPDATE webhook_events
            SET 
                processing_error = SQLERRM
            WHERE id = event_record.webhook_id;
        END;
    END LOOP;
    
    -- Create the result JSON
    result := jsonb_build_object(
        'processed_count', processed_count,
        'updated_assets', update_count
    );
    
    RETURN result;
END;
$$;

-- Create a function that can be called from the server to create the webhook_events table
-- This is used by the webhook endpoint if the table doesn't exist
CREATE OR REPLACE FUNCTION public.create_webhook_events_table()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Create the webhook_events table if it doesn't exist
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
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_webhook_events_mux_asset_id ON webhook_events(mux_asset_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_mux_upload_id ON webhook_events(mux_upload_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Allow anonymous access to the webhook_events table (for storing events)
-- but only for insert operations
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access to webhook_events" ON public.webhook_events;
CREATE POLICY "Allow service role full access to webhook_events" 
    ON public.webhook_events 
    USING (true)
    WITH CHECK (true);

-- Ensure authenticated users can only process their own events
DROP POLICY IF EXISTS "Allow users to see webhook events" ON public.webhook_events;
CREATE POLICY "Allow users to see webhook events"
    ON public.webhook_events
    FOR SELECT
    USING (true);

-- Add a function to directly fix videos for a specific user's assets
CREATE OR REPLACE FUNCTION public.update_user_videos_from_webhooks(user_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    fixed_count INTEGER := 0;
BEGIN
    -- Find user's video assets that need fixing
    FOR i IN 1..10 LOOP -- Limit to 10 fixes at once
        -- Find an unprocessed video.asset.ready event
        WITH latest_event AS (
            SELECT 
                we.id as webhook_id,
                we.mux_upload_id,
                we.mux_asset_id,
                we.payload
            FROM 
                webhook_events we
            WHERE 
                we.processed = false
                AND we.event_type = 'video.asset.ready'
                AND EXISTS (
                    SELECT 1 FROM assets a 
                    WHERE a.user_id = user_uuid 
                    AND a.mux_asset_id = we.mux_upload_id
                )
            ORDER BY we.created_at DESC
            LIMIT 1
        )
        UPDATE assets a
        SET 
            mux_processing_status = 'ready',
            mux_playback_id = (le.payload->'data'->'playback_ids'->0->>'id'),
            mux_max_resolution = (le.payload->'data'->>'max_stored_resolution'),
            mux_aspect_ratio = (le.payload->'data'->>'aspect_ratio'),
            mux_duration = (le.payload->'data'->>'duration')::FLOAT,
            media_url = 'https://stream.mux.com/' || (le.payload->'data'->'playback_ids'->0->>'id') || '.m3u8',
            mux_asset_id = le.mux_asset_id
        FROM latest_event le
        WHERE 
            a.mux_asset_id = le.mux_upload_id
            AND a.user_id = user_uuid
        RETURNING le.webhook_id
        INTO result;
        
        IF result IS NULL THEN
            -- No more assets to fix
            EXIT;
        END IF;
        
        -- Mark webhook as processed
        UPDATE webhook_events
        SET 
            processed = true,
            processed_at = NOW()
        WHERE id = result->>'webhook_id';
        
        fixed_count := fixed_count + 1;
    END LOOP;
    
    -- Return the result
    RETURN jsonb_build_object('fixed_count', fixed_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$; 