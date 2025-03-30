import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { corsOptionsResponse, corsJsonResponse, corsErrorResponse } from '@/lib/api/response';
import { withAuth } from '@/lib/api/auth';
import { getStaticRenditionDownloadUrl } from '@/lib/mux';

// Add support for OPTIONS method (for CORS preflight requests)
export async function OPTIONS() {
  return corsOptionsResponse();
}

/**
 * Debug endpoint to check transcript status and manually trigger transcription
 */
export const GET = withAuth(async (request: Request) => {
  try {
    // Get the assetId from the query parameters
    const url = new URL(request.url);
    const assetId = url.searchParams.get('assetId');

    if (!assetId) {
      return corsJsonResponse({
        error: 'Missing assetId',
        message: 'Please provide an assetId as a query parameter'
      }, { status: 400 });
    }

    // Get service client for database operations
    const supabase = await createServiceSupabaseClient();

    // Find the asset
    const { data: asset, error } = await supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (error) {
      console.error('Error fetching asset:', error);
      return corsJsonResponse({
        error: 'Asset not found',
        message: `No asset found with ID: ${assetId}`
      }, { status: 404 });
    }

    // Return the transcript status
    return corsJsonResponse({
      asset_id: asset.id,
      mux_asset_id: asset.mux_asset_id,
      mux_audio_url: asset.mux_audio_url,
      transcript_status: asset.transcript_processing_status,
      transcript_error: asset.transcript_error,
      has_transcript: !!asset.transcript,
      transcript_text_length: asset.transcript_text ? asset.transcript_text.length : 0,
      message: 'To trigger transcription, make a POST request to this endpoint with the assetId'
    });
  } catch (error) {
    console.error('Error in debug transcript API:', error);
    return corsErrorResponse('Server error', 500);
  }
});

/**
 * Debug endpoint to manually trigger transcription
 */
export const POST = withAuth(async (request: Request) => {
  try {
    // Get request body or query params
    let assetId: string | null = null;
    
    try {
      const body = await request.json();
      assetId = body.assetId;
    } catch (e) {
      // If not in body, try query params
      console.log(e);
      const url = new URL(request.url);
      assetId = url.searchParams.get('assetId');
    }

    if (!assetId) {
      return corsErrorResponse('Missing assetId', 400);
    }

    // Get service client for database operations
    const supabase = await createServiceSupabaseClient();

    // Find the asset
    const { data: asset, error: fetchError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (fetchError) {
      console.error('Error fetching asset:', fetchError);
      return corsErrorResponse('Asset not found', 404);
    }

    // Check if we need to get a proper download URL first
    if (asset.mux_audio_url && asset.mux_audio_url.startsWith('pending:')) {
      console.log(`Audio URL is in pending format: ${asset.mux_audio_url}`);
      
      try {
        // Extract asset ID, rendition ID, and rendition name from the pending URL
        // Format: "pending:{assetId}/{renditionId}/{renditionName}"
        const pendingData = asset.mux_audio_url.split('pending:')[1];
        const parts = pendingData.split('/');
        
        if (parts.length < 2) {
          throw new Error(`Invalid pending URL format: ${asset.mux_audio_url}`);
        }
        
        const muxAssetId = parts[0];
        const renditionId = parts[1];
        const renditionName = parts.length > 2 ? parts[2] : 'audio.m4a';
        
        console.log(`Getting static rendition URL for asset ${muxAssetId}, rendition ${renditionId}, name ${renditionName}`);
        
        // Get a proper static rendition URL
        const staticRenditionUrl = await getStaticRenditionDownloadUrl(muxAssetId, renditionId, renditionName);
        
        console.log(`Got static rendition URL: ${staticRenditionUrl}`);
        
        // Update the asset with the proper URL
        const { error: updateError } = await supabase
          .from('assets')
          .update({ mux_audio_url: staticRenditionUrl })
          .eq('id', assetId);
          
        if (updateError) {
          throw updateError;
        }
        
        // Update our local copy of the asset
        asset.mux_audio_url = staticRenditionUrl;
      } catch (urlError) {
        console.error('Error getting static rendition URL:', urlError);
        return corsErrorResponse(`Failed to get static rendition URL: ${urlError instanceof Error ? urlError.message : String(urlError)}`, 500);
      }
    }

    // Make a request to the transcribe API
    const transcribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/transcribe`;
    console.log(`Making request to ${transcribeUrl} for asset ${assetId}`);
    
    const transcribeResponse = await fetch(transcribeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
      },
      body: JSON.stringify({ assetId })
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      return corsJsonResponse({
        error: 'Transcription request failed',
        status: transcribeResponse.status,
        message: errorText
      }, { status: transcribeResponse.status });
    }

    const result = await transcribeResponse.json();
    
    return corsJsonResponse({
      message: 'Transcription triggered successfully',
      audioUrl: asset.mux_audio_url,
      result
    });
  } catch (error) {
    console.error('Error triggering transcription:', error);
    return corsErrorResponse('Server error', 500);
  }
}); 