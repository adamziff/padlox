-- Drop the existing transcript status check constraint if it exists
ALTER TABLE public.assets
DROP CONSTRAINT IF EXISTS assets_transcript_processing_status_check;

-- Re-add the constraint including the 'audio_ready' status
ALTER TABLE public.assets
ADD CONSTRAINT assets_transcript_processing_status_check
CHECK (transcript_processing_status IN (
    'not_started', 
    'pending', 
    'audio_ready', -- Add the new allowed status
    'completed', 
    'failed'
)); 