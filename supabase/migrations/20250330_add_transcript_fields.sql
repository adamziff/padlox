-- Migration to add transcript and static rendition fields to assets table

-- Add audio_url for the static m4a rendition
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS mux_audio_url VARCHAR;

-- Add fields for transcription
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS transcript JSONB,
ADD COLUMN IF NOT EXISTS transcript_text TEXT,
ADD COLUMN IF NOT EXISTS transcript_processing_status VARCHAR CHECK (transcript_processing_status IN ('pending', 'processing', 'completed', 'error')),
ADD COLUMN IF NOT EXISTS transcript_error TEXT;

-- Create indexes for transcript status and audio URL
CREATE INDEX IF NOT EXISTS idx_assets_transcript_processing_status ON public.assets(transcript_processing_status);
CREATE INDEX IF NOT EXISTS idx_assets_mux_audio_url ON public.assets(mux_audio_url);

-- Update video.asset.static_rendition.ready webhook handler
CREATE OR REPLACE FUNCTION public.process_static_rendition_webhooks()
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
    -- Find pending static rendition webhook events
    FOR event_record IN 
        SELECT 
            we.id as webhook_id, 
            we.event_type, 
            we.mux_asset_id,
            we.payload,
            a.id as asset_id
        FROM 
            webhook_events we
        JOIN 
            assets a ON we.mux_asset_id = a.mux_asset_id
        WHERE 
            we.processed = false
            AND we.event_type = 'video.asset.static_rendition.ready'
        ORDER BY 
            we.created_at DESC
        LIMIT 100
    LOOP
        BEGIN
            -- Get static rendition name and URL from payload
            DECLARE
                rendition_name TEXT := event_record.payload->'data'->>'name';
                rendition_id TEXT := event_record.payload->'data'->>'id';
                asset_id TEXT := event_record.payload->'data'->>'asset_id';
                rendition_url TEXT;
            BEGIN
                -- Store rendition information 
                -- NOTE: We don't directly construct the stream URL for Deepgram here anymore.
                -- Instead, we set the transcript_processing_status to 'pending' and let the 
                -- Node.js API handle fetching a proper temporary download URL from Mux, which
                -- Deepgram can access. Direct stream URLs require authentication and will 
                -- return 404 errors when accessed by Deepgram.
                IF rendition_name = 'audio.m4a' AND asset_id IS NOT NULL AND rendition_id IS NOT NULL THEN
                    -- Store the rendition information so the API can generate a proper download URL
                    -- Format: "pending:{assetId}/{renditionId}/{renditionName}"
                    UPDATE assets
                    SET 
                        mux_audio_url = 'pending:' || asset_id || '/' || rendition_id || '/' || rendition_name,
                        transcript_processing_status = 'pending'
                    WHERE 
                        id = event_record.asset_id;
                    
                    GET DIAGNOSTICS update_count = ROW_COUNT;
                END IF;
            END;
            
            -- Mark this webhook as processed
            UPDATE webhook_events
            SET 
                processed = true,
                processed_at = NOW(),
                asset_id = event_record.asset_id
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

-- Add transcript-related fields to assets table

-- Add transcript column for storing the full structured transcript data
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS transcript JSONB;

-- Add transcript_text column for storing the plain text version of the transcript
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS transcript_text TEXT;

-- Add column for tracking transcript processing status
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS transcript_processing_status VARCHAR 
DEFAULT NULL;

-- Add column for storing any transcript errors
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS transcript_error TEXT;

-- Add audio URL column for storing the URL to the audio file extracted from video
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS mux_audio_url TEXT;

-- Create the broadcast table if it doesn't exist (used for realtime notifications)
CREATE TABLE IF NOT EXISTS public.broadcast (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    channel TEXT NOT NULL,
    event TEXT NOT NULL,
    payload JSONB
);

-- Add policy to allow service role to insert broadcasts
DROP POLICY IF EXISTS "Allow service role to insert broadcasts" ON public.broadcast;
CREATE POLICY "Allow service role to insert broadcasts" 
ON public.broadcast 
FOR INSERT
WITH CHECK (true);

-- Add policy to allow any authenticated user to view broadcasts
DROP POLICY IF EXISTS "Allow any user to view broadcasts" ON public.broadcast;
CREATE POLICY "Allow any user to view broadcasts" 
ON public.broadcast 
FOR SELECT
USING (true);

-- Enable RLS on the broadcast table
ALTER TABLE public.broadcast ENABLE ROW LEVEL SECURITY;

-- Add a supabase function to broadcast transcript ready events
CREATE OR REPLACE FUNCTION public.notify_transcript_ready(asset_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert a broadcast event
    INSERT INTO public.broadcast (channel, event, payload)
    VALUES ('assets-changes', 'transcript-ready', jsonb_build_object('id', asset_id));
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Add an index on the transcript_processing_status column
CREATE INDEX IF NOT EXISTS idx_assets_transcript_status 
ON public.assets(transcript_processing_status);

-- Add a function to check for pending transcriptions
CREATE OR REPLACE FUNCTION public.find_pending_transcriptions(limit_count INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Find assets with pending transcriptions
    SELECT jsonb_agg(id)
    INTO result
    FROM assets
    WHERE 
        transcript_processing_status = 'pending'
        AND mux_audio_url IS NOT NULL
        AND mux_processing_status = 'ready'
    LIMIT limit_count;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$; 