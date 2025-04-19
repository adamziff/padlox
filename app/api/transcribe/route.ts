import { createClient } from '@/utils/supabase/server';
import { corsOptionsResponse, corsJsonResponse, corsErrorResponse } from '@/lib/api/response';
import { transcribeAudioUrl, extractParagraphText } from '@/lib/deepgram';
import { withAuth } from '@/lib/api/auth';
import { getStaticRenditionDownloadUrl } from '@/lib/mux';

// Add support for OPTIONS method (for CORS preflight requests)
export async function OPTIONS() {
  return corsOptionsResponse();
}

/**
 * Process transcriptions for assets with audio URLs
 * This can be called by:
 * 1. A webhook handler after static rendition is ready
 * 2. A background job checking for pending transcriptions
 * 3. A manual request to transcribe a specific asset
 */
export const POST = withAuth(async (request: Request) => {
  try {
    // Get request body
    const body = await request.json();
    const { assetId } = body;

    if (!assetId) {
      return corsErrorResponse('Missing assetId', 400);
    }

    // Use the client that handles cookies/user sessions
    const supabase = await createClient();

    // Find the asset
    const { data: asset, error } = await supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (error) {
      console.error('Error fetching asset:', error);
      return corsErrorResponse('Asset not found', 404);
    }

    // Check if we have an audio URL
    if (!asset.mux_audio_url) {
      return corsErrorResponse('Asset has no audio URL for transcription', 400);
    }
    
    // Check if we need to get a proper download URL first
    if (asset.mux_audio_url.startsWith('pending:')) {
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
        
        // Get a proper download URL
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
        await supabase
          .from('assets')
          .update({
            transcript_processing_status: 'error',
            transcript_error: `Failed to get static rendition URL: ${urlError instanceof Error ? urlError.message : String(urlError)}`
          })
          .eq('id', assetId);
          
        return corsErrorResponse(`Failed to get static rendition URL: ${urlError instanceof Error ? urlError.message : String(urlError)}`, 500);
      }
    }

    // Update asset to show transcription is processing
    await supabase
      .from('assets')
      .update({
        transcript_processing_status: 'processing'
      })
      .eq('id', assetId);

    try {
      console.log(`Processing transcription for asset ${assetId} with audio URL ${asset.mux_audio_url}`);

      // Process the transcription
      const transcriptData = await transcribeAudioUrl(asset.mux_audio_url);
      
      // Extract plain text for easier searching/display
      const plainText = extractParagraphText(transcriptData);

      // Update the asset with the transcription data
      const { error: updateError } = await supabase
        .from('assets')
        .update({
          transcript: transcriptData,
          transcript_text: plainText,
          transcript_processing_status: 'completed',
          transcript_error: null
        })
        .eq('id', assetId);

      if (updateError) {
        throw updateError;
      }

      // Broadcast that the transcript is ready using multiple methods for redundancy
      
      // Method 1: Use the database function
      const { data: notifyResult, error: notifyError } = await supabase
        .rpc('notify_transcript_ready', { asset_id: assetId });
        
      if (notifyError) {
        console.warn('Error calling notify_transcript_ready function:', notifyError);
      } else {
        console.log('Successfully called notify_transcript_ready function:', notifyResult);
      }
        
      // Method 2: Insert directly into the broadcast table
      await supabase
        .from('broadcast')
        .insert({
          channel: 'assets-changes',
          event: 'transcript-ready',
          payload: { id: assetId }
        });

      // Method 3: Use the Supabase broadcast API
      await supabase
        .channel('assets-changes')
        .send({
          type: 'broadcast',
          event: 'transcript-ready',
          payload: { id: assetId }
        });

      console.log(`Broadcasting transcript-ready event for asset ${assetId} through multiple channels`);

      // Mark original video as source *before* sending for analysis
      const { error: markSourceError } = await supabase
        .from('assets')
        .update({ is_source_video: true })
        .eq('id', assetId);

      if (markSourceError) {
        // Log the error but continue, analysis is more critical
        console.error(`[Transcribe API] Error marking asset ${assetId} as source:`, markSourceError);
      }

      // Send to AI for analysis AFTER saving transcript and marking as source
      console.log(`[Transcribe API] Sending transcript for asset ${assetId} to analysis API...`);
      const analysisApiUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/analyze-transcript`;
      const analysisApiKey = process.env.API_SECRET_KEY;

      if (!analysisApiKey) {
        console.error('[Transcribe API] Missing API_SECRET_KEY, cannot call analysis endpoint.');
        // Potentially update asset status to indicate analysis pending/failed?
      } else {
        await fetch(analysisApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Use API Key for server-to-server authentication
            'Authorization': `Bearer ${analysisApiKey}`
          },
          body: JSON.stringify({
            transcript: transcriptData, // Pass the full transcript data
            videoAssetId: assetId
          })
        })
        .then(async (analysisResponse) => {
          if (!analysisResponse.ok) {
            const errorBody = await analysisResponse.text();
            console.error(`[Transcribe API] Failed to trigger transcript analysis for asset ${assetId}: ${analysisResponse.status} ${analysisResponse.statusText}`, errorBody);
            // Update asset status to reflect analysis trigger failure?
            await supabase
              .from('assets')
              .update({ transcript_error: `Failed to start analysis: ${analysisResponse.status}` })
              .eq('id', assetId);
          } else {
            const successBody = await analysisResponse.json();
            console.log(`[Transcribe API] Successfully triggered transcript analysis for asset ${assetId}. Response:`, successBody);
          }
        })
        .catch((analysisError) => {
          console.error(`[Transcribe API] Error calling analysis API for asset ${assetId}:`, analysisError);
          // Update asset status to reflect analysis trigger failure?
          supabase
            .from('assets')
            .update({ transcript_error: `Error calling analysis API: ${analysisError instanceof Error ? analysisError.message : 'Unknown fetch error'}` })
            .eq('id', assetId);
        });
      }

      return corsJsonResponse({
        success: true,
        message: 'Transcription processed successfully',
        assetId
      });
    } catch (transcriptionError) {
      console.error('Error processing transcription:', transcriptionError);
      
      // Update asset to show transcription error
      await supabase
        .from('assets')
        .update({
          transcript_processing_status: 'error',
          transcript_error: transcriptionError instanceof Error 
            ? transcriptionError.message 
            : 'Unknown transcription error'
        })
        .eq('id', assetId);

      return corsErrorResponse(
        `Transcription processing failed: ${transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error'}`,
        500
      );
    }
  } catch (error) {
    console.error('Error in transcription API:', error);
    return corsErrorResponse('Server error processing transcription request', 500);
  }
}); 