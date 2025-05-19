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
  console.log(`[Transcribe API] POST handler started at ${new Date().toISOString()}`);
  console.log(`[Transcribe API] Request URL: ${request.url}`);
  
  try {
    // Get request body
    const body = await request.json();
    const { assetId } = body;

    console.log(`[Transcribe API] Processing request for assetId: ${assetId}`);

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
      const transcriptText = extractParagraphText(transcriptData);

      // Update the asset with the transcription data
      const { error: updateError } = await supabase
        .from('assets')
        .update({
          transcript: transcriptData,
          transcript_text: transcriptText,
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

      const mergeUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/analyze-transcript/merge-with-scratch`;
      console.log(`[Transcribe] Using analyze URL: ${mergeUrl}`);
      
      // Even if the transcript is empty, we still want to try to merge with scratch items
      // Create a request body with or without transcript text
      const requestBody: {
        user_id: string;
        asset_id: string;
        mux_asset_id: string;
        transcript?: string;
      } = {
        user_id: asset.user_id,
        asset_id: asset.id,
        mux_asset_id: asset.mux_asset_id
      };
      
      if (transcriptData && typeof transcriptText === 'string' && transcriptText.length > 0) {
        requestBody.transcript = transcriptText;
      } else {
        console.log(`[Transcribe] No transcript text available, but still proceeding with scratch item merge`);
      }
      
      console.log(`[Transcribe] Sending request with body: ${JSON.stringify({
        ...requestBody,
        transcript_length: transcriptText?.length || 0
      })}`);
      
      let attemptCount = 0;
      const maxAttempts = 3;
      
      // Try up to 3 times with exponential backoff
      let success = false;
      
      while (attemptCount < maxAttempts && !success) {
        try {
          if (attemptCount > 0) {
            console.log(`[Transcribe] Retry attempt ${attemptCount} for merge-with-scratch API call`);
            // Exponential backoff: 1s, 2s, 4s, etc.
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attemptCount - 1) * 1000));
          }
          
          const analyzeResponse = await fetch(mergeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!analyzeResponse.ok) {
            const errorText = await analyzeResponse.text();
            console.error(`[Transcribe] Error analyzing transcript and scratch items for asset ${assetId}: ${errorText}`);
            console.error(`[Transcribe] Failed to analyze with status: ${analyzeResponse.status}`);
            attemptCount++;
          } else {
            const analysisResult = await analyzeResponse.json();
            console.log(`[Transcribe] Successfully merged and analyzed transcript and scratch items for asset ${assetId}. Found ${analysisResult.items?.length || 0} items.`);
            console.log(`[Transcribe] Analysis result: ${JSON.stringify(analysisResult)}`);
            success = true;
          }
        } catch (error) {
          console.error(`[Transcribe] Exception during attempt ${attemptCount + 1} to trigger transcript and scratch item analysis for asset ${assetId}:`, error);
          attemptCount++;
        }
      }
      
      if (!success) {
        console.error(`[Transcribe] Failed to merge transcript with scratch items after ${maxAttempts} attempts. Will rely on webhook fallback mechanism.`);
        // We don't fail the overall request if analysis fails - just log the error
      }
      
      // Always return a success response at the end of the try block
      return corsJsonResponse({
        success: true,
        message: 'Transcription processed successfully' + (transcriptText?.length ? '' : ' (no speech detected)'),
        assetId,
        hasTranscript: !!transcriptText?.length
      });
    } catch (error) {
      console.error(`[Transcribe API] Error processing transcription for asset ${assetId}:`, error);
      await supabase
        .from('assets')
        .update({
          transcript_processing_status: 'error',
          transcript_error: error instanceof Error ? error.message : String(error)
        })
        .eq('id', assetId);
      
      return corsErrorResponse(`Error processing transcription: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
  } catch (error) {
    console.error(`[Transcribe API] Error processing request:`, error);
    return corsErrorResponse(`Error processing request: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
});