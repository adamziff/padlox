-- Fix realtime DELETE events for assets table
-- This migration ensures that DELETE events are properly broadcast via realtime

-- Set replica identity to FULL to ensure DELETE events include all column data
ALTER TABLE public.assets REPLICA IDENTITY FULL;

-- Create a specific policy for realtime DELETE operations
-- This allows the realtime system to see rows that are being deleted
CREATE POLICY "Enable realtime DELETE events" 
    ON public.assets 
    FOR DELETE 
    TO supabase_realtime_admin 
    USING (true);

-- Ensure the table is properly added to the realtime publication
-- This refreshes the publication to include DELETE events
DO $$
BEGIN
    -- Try to drop the table from publication (ignore if not present)
    BEGIN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.assets;
    EXCEPTION WHEN OTHERS THEN
        -- Table wasn't in publication, that's fine
        NULL;
    END;
    
    -- Add the table to publication
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
END
$$; 