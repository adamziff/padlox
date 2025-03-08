-- Migration to create a special policy for webhook access to assets
-- This allows the webhook handler to access assets by mux_asset_id without authentication

-- Allow access to assets by mux_asset_id for webhook processing
-- This is a limited exception to standard RLS policies
DROP POLICY IF EXISTS "Allow access to assets by mux_asset_id" ON public.assets;
CREATE POLICY "Allow access to assets by mux_asset_id" 
    ON public.assets
    FOR SELECT 
    USING (mux_asset_id IS NOT NULL);

-- This policy only allows reading assets with a mux_asset_id
-- It does not allow updating, creating, or deleting without proper authentication
-- It's specifically designed to let the webhook handler find assets to update 