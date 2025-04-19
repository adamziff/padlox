import { verifyMuxWebhook } from '@/lib/mux';
import { MuxWebhookEvent } from '@/types/mux';
import { createServiceSupabaseClient } from '@/lib/auth/supabase';

import { corsOptionsResponse, corsJsonResponse, corsErrorResponse } from '@/lib/api/response';

// Add support for OPTIONS method (for CORS preflight requests)
export async function OPTIONS() {
  return corsOptionsResponse();
}

// Add support for GET method (for webhook validation)
export async function GET() {
  return corsJsonResponse({ message: 'Mux webhook endpoint is active' });
}

// Handle Mux webhook notifications
export async function POST(request: Request) {
  try {
    // Get the Mux signature header
    const muxSignature = request.headers.get('Mux-Signature') || '';
    
    // Read the request body as text
    const rawBody = await request.text();
    
    // Verify the webhook signature unless explicitly disabled
    const skipSignatureVerification = process.env.MUX_SKIP_SIGNATURE_VERIFICATION === 'true';
    
    if (!skipSignatureVerification) {
      // Use the webhook signing secret, not the API token secret
      const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.error('Missing MUX_WEBHOOK_SECRET environment variable');
        return corsErrorResponse('Server configuration error', 500);
      }
      
      // Try Mux webhook verification
      if (!verifyMuxWebhook(rawBody, muxSignature, webhookSecret)) {
        console.error('Invalid Mux webhook signature');
        return corsErrorResponse('Invalid signature', 401);
      }
    } else {
      console.warn('WARNING: Mux webhook signature verification is disabled');
    }
    
    // Parse the webhook payload
    const event = JSON.parse(rawBody) as MuxWebhookEvent & { 
      data: { 
        id?: string; 
        upload_id?: string; 
        asset_id?: string;
        type?: string; 
        static_renditions?: { name: string; status: string }[];
        metadata?: { correlation_id?: string; [key: string]: string | number | boolean | null | undefined };
        name?: string;
        status?: string;
        playback_ids?: { id: string; policy: 'signed' | 'public' }[];
        duration?: number;
        aspect_ratio?: string;
        max_stored_resolution?: string;
      }
    };
    
    console.log(`Received webhook from Mux: ${event.type}`);
    
    // We'll store all webhook events for processing, but we'll only act immediately on specific types
    const serviceClient = await createServiceSupabaseClient();
    
    // Extract necessary IDs early (use optional chaining and nullish coalescing)
    const muxAssetId = event.data?.id || event.data?.asset_id || null; // Use asset_id as fallback if top-level id is missing
    const muxUploadId = event.data?.upload_id || (event.type === 'video.upload.asset_created' ? event.data?.id : null) || null; // Upload ID is in data.id for video.upload.asset_created
    const correlationId = event.data?.metadata?.correlation_id || null;
    
    // Check if webhook_events table exists
    let webhookTableExists = false;
    try {
      const { error: tableCheckError } = await serviceClient
        .from('webhook_events')
        .select('id')
        .limit(1);
        
      if (tableCheckError && tableCheckError.code === '42P01') {
        console.error('ERROR: webhook_events table does not exist. Webhook data will not be stored.');
        console.error('Create the table manually before processing webhooks.');
        webhookTableExists = false;
      } else if (tableCheckError) {
        console.error('Error checking webhook_events table:', tableCheckError);
        webhookTableExists = false;
      } else {
        webhookTableExists = true;
      }
    } catch (e) {
      console.error('Error checking webhook_events table:', e);
      webhookTableExists = false;
    }
    
    // Store the webhook event if the table exists
    if (webhookTableExists && (muxAssetId || muxUploadId)) { // Store if we have any Mux ID
      try {
        const { error: insertError } = await serviceClient
          .from('webhook_events')
          .insert({
            event_type: event.type,
            event_id: event.id,
            payload: event, // Store the raw event payload
            processed: false,
            mux_asset_id: muxAssetId,
            mux_upload_id: muxUploadId,
            mux_correlation_id: correlationId
          });
          
        if (insertError) {
          console.error('Error storing webhook event:', insertError);
        } else {
          console.log(`Successfully stored webhook event ${event.type} (${event.id})`);
        }
      } catch (e) {
        console.error('Error inserting webhook event:', e);
      }
    } else if (!muxAssetId && !muxUploadId) {
        console.warn(`Webhook event ${event.type} (${event.id}) received without a Mux Asset or Upload ID.`);
    }
    
    // --- Handle Upload Asset Created Event --- 
    // This event links the Upload ID to the final Asset ID. We use it to update our record.
    // IMPORTANT: This event payload has asset_id within data, not id.
    // AND: The Upload ID for *this specific event type* is in event.data.id, not event.data.upload_id
    if (event.type === 'video.upload.asset_created') { 
      const uploadId = event.data?.id;
      const actualAssetId = event.data?.asset_id; // Correct: Get Asset ID from data.asset_id
      
      // Check if both IDs were successfully extracted before proceeding
      if (uploadId && actualAssetId) { 
        console.log(`Processing video.upload.asset_created for Upload ID: ${uploadId}. Actual Asset ID: ${actualAssetId}`);

        // Find the asset record using the Upload ID (which we incorrectly stored in mux_asset_id)
        const { data: assetToUpdate, error: findError } = await serviceClient
          .from('assets')
          .select('id, mux_asset_id') // Select current mux_asset_id to confirm
          .eq('mux_asset_id', uploadId) // Match based on the stored Upload ID
          .limit(1)
          .single();

        if (findError) {
          console.error(`Error finding asset record using Upload ID ${uploadId} for update:`, findError);
        } else if (!assetToUpdate) {
          console.warn(`Asset record not found using Upload ID ${uploadId}. It might have been created differently or already updated.`);
        } else {
          console.log(`Found asset ${assetToUpdate.id} with current mux_asset_id ${assetToUpdate.mux_asset_id}. Updating with actual Asset ID ${actualAssetId}.`);
          // Update the record with the correct Mux Asset ID
          const { error: updateError } = await serviceClient
            .from('assets')
            .update({ 
              mux_asset_id: actualAssetId, // Set the correct Asset ID
              last_updated: new Date().toISOString()
            })
            .eq('id', assetToUpdate.id); // Update by internal ID

          if (updateError) {
            console.error(`Error updating asset ${assetToUpdate.id} with actual Mux Asset ID ${actualAssetId}:`, updateError);
          } else {
            console.log(`Successfully updated asset ${assetToUpdate.id} with actual Mux Asset ID ${actualAssetId}.`);
            // Mark this webhook as processed
            if (webhookTableExists) {
              try {
                await serviceClient
                  .from('webhook_events')
                  .update({ processed: true, processed_at: new Date().toISOString(), asset_id: assetToUpdate.id })
                  .eq('event_id', event.id);
                console.log(`Marked video.upload.asset_created webhook event ${event.id} as processed.`);
              } catch (markError) {
                console.error(`Error marking video.upload.asset_created webhook ${event.id} as processed:`, markError);
              }
            }
          }
        }
      } else {
        console.warn(`[video.upload.asset_created] Missing upload_id or asset_id in event data. Skipping update.`);
      }
    }
    // --- End Upload Asset Created Event ---
    
    // --- Handle Asset Ready Event --- 
    // This is the primary trigger for downstream processing like transcription
    // *** UPDATED: Now only updates asset info, DOES NOT trigger transcription ***
    if (event.type === 'video.asset.ready' && muxAssetId) {
      console.log(`Processing video.asset.ready for Mux Asset ID: ${muxAssetId}`);

      // Get necessary data from the event payload
      const playbackId = event.data.playback_ids?.[0]?.id;
      const duration = event.data.duration;
      const aspectRatio = event.data.aspect_ratio;
      const maxResolution = event.data.max_stored_resolution;
      const streamUrl = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null;

      // Update the asset record with playback info and mark as ready
      try {
          const { error: updateError } = await serviceClient
              .from('assets')
              .update({ 
                  mux_playback_id: playbackId,
                  mux_duration: duration,
                  mux_aspect_ratio: aspectRatio,
                  mux_max_resolution: maxResolution,
                  mux_processing_status: 'ready', // Mark Mux processing as complete
                  media_url: streamUrl, // Store the streaming URL
                  last_updated: new Date().toISOString()
              })
              .eq('mux_asset_id', muxAssetId); 

          if (updateError) {
              console.error(`Error updating asset ${muxAssetId} with ready status and playback info:`, updateError);
          } else {
              console.log(`Successfully updated asset ${muxAssetId} with ready status and playback info.`);
              // Mark this specific webhook as processed
              if (webhookTableExists) {
                  // Find internal ID just for marking the webhook
                  const { data: asset } = await serviceClient.from('assets').select('id').eq('mux_asset_id', muxAssetId).single();
                  await serviceClient
                      .from('webhook_events')
                      .update({ processed: true, processed_at: new Date().toISOString(), asset_id: asset?.id || null })
                      .eq('event_id', event.id);
                  console.log(`Marked video.asset.ready webhook event ${event.id} as processed.`);
              }
          }
      } catch (error) {
           console.error(`Exception during asset update for video.asset.ready (Asset ID: ${muxAssetId}):`, error);
      }
      
      // --- REMOVED TRANSCRIPTION TRIGGER LOGIC FROM HERE --- 

    }
    // --- End Asset Ready Event --- 

    // --- Handle Static Rendition Ready Event --- 
    // *** UPDATED: Now triggers transcription for the audio rendition ***
    else if (event.type === 'video.asset.static_rendition.ready') {
        const renditionMuxAssetId = event.data?.asset_id; // Asset ID is in data.asset_id for this event
        const renditionName = event.data?.name;
        const renditionStatus = event.data?.status;

        console.log(`Received video.asset.static_rendition.ready for Asset ${renditionMuxAssetId}, Rendition: ${renditionName}, Status: ${renditionStatus}`);

        // Trigger transcription ONLY if it's the audio rendition and it's ready
        if (renditionName === 'audio.m4a' && renditionStatus === 'ready' && renditionMuxAssetId) {
            console.log(`Audio rendition 'audio.m4a' ready for asset ${renditionMuxAssetId}. Checking if transcription should be triggered.`);

            // Find the corresponding asset record in our DB
            const { data: asset, error: assetError } = await serviceClient
                .from('assets')
                .select('id, transcript_processing_status') // Select status to check if already processed
                .eq('mux_asset_id', renditionMuxAssetId) // Use the asset ID from the rendition event
                .limit(1)
                .single();

            if (assetError || !asset) {
                console.error(`Error finding asset or asset not found with mux_asset_id ${renditionMuxAssetId} for 'static_rendition.ready' event processing:`, assetError);
            } else {
                const internalAssetId = asset.id;
                const currentStatus = asset.transcript_processing_status;
                console.log(`Found internal asset ID ${internalAssetId} for Mux asset ${renditionMuxAssetId}. Current transcript status: ${currentStatus}`);

                // Check if transcription is already pending, processing, or completed
                if (currentStatus === 'pending' || currentStatus === 'processing' || currentStatus === 'completed') {
                    console.log(`Transcription for asset ${internalAssetId} (Mux: ${renditionMuxAssetId}) already started or completed. Skipping trigger from static_rendition.ready.`);
                } else {
                    console.log(`Asset ${internalAssetId} audio rendition ready. Updating status and triggering transcription.`);
                    
                    // Get rendition details needed for the pending URL
                    const renditionId = event.data?.id; // ID of the rendition itself
                    if (!renditionId) {
                      console.error(`Missing rendition ID in static_rendition.ready event payload for asset ${internalAssetId}. Cannot proceed.`);
                      // Mark as processed with error?
                      if (webhookTableExists) {
                         try {
                            await serviceClient.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString(), asset_id: internalAssetId }).eq('event_id', event.id);
                            console.log(`Marked static_rendition.ready webhook event ${event.id} as processed (missing rendition ID).`);
                         } catch (markError) { console.error(`Error marking static_rendition.ready webhook ${event.id} as processed after missing rendition ID:`, markError); }
                      }
                      return; // Stop processing this event
                    }
                    
                    const pendingAudioUrl = `pending:${renditionMuxAssetId}/${renditionId}/${renditionName}`;
                    console.log(`Constructed pending audio URL: ${pendingAudioUrl}`);

                    // Update the asset's status and store the pending URL *before* triggering
                    const { error: updateError } = await serviceClient
                        .from('assets')
                        .update({
                           transcript_processing_status: 'pending',
                           mux_audio_url: pendingAudioUrl, // Store the pending URL
                           last_updated: new Date().toISOString()
                        })
                        .eq('id', internalAssetId);

                    if (updateError) {
                        console.error(`Error setting transcript status to 'pending' for asset ${internalAssetId} via static_rendition.ready:`, updateError);
                    } else {
                        console.log(`Set transcript status to 'pending' for asset ${internalAssetId} via static_rendition.ready.`);

                        // Trigger the transcription API - DO NOT AWAIT
                        fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/transcribe`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.API_SECRET_KEY}`,
                            },
                            body: JSON.stringify({ assetId: internalAssetId }), // Pass internal DB asset ID
                        }).then(async (res) => {
                            if (!res.ok) {
                                const errorBody = await res.text().catch(() => 'Failed to read error body');
                                console.error(`Error triggering transcription for asset ${internalAssetId} from static_rendition.ready: ${res.status} ${res.statusText} - ${errorBody}`);
                            } else {
                                console.log(`Successfully triggered transcription for asset ${internalAssetId} from static_rendition.ready`);
                            }
                        }).catch(err => {
                            console.error(`Fetch error triggering transcription for asset ${internalAssetId} from static_rendition.ready:`, err);
                        });

                        // Mark webhook as processed ONLY if we triggered transcription
                        if (webhookTableExists) {
                            try {
                                await serviceClient
                                    .from('webhook_events')
                                    .update({ processed: true, processed_at: new Date().toISOString(), asset_id: internalAssetId })
                                    .eq('event_id', event.id);
                                console.log(`Marked static_rendition.ready webhook event ${event.id} as processed (triggered transcription).`);
                            } catch (markError) {
                                console.error(`Error marking static_rendition.ready webhook ${event.id} as processed:`, markError);
                            }
                        }
                    }
                }
            }
        } else {
             console.log(`Static rendition event received for ${renditionName} (Asset: ${renditionMuxAssetId}, Status: ${renditionStatus}). Not triggering transcription.`);
             // Optionally mark non-audio or non-ready events as processed immediately if desired
             if (webhookTableExists) {
                 try {
                    // Find internal ID just for marking the webhook
                    const { data: asset } = await serviceClient.from('assets').select('id').eq('mux_asset_id', renditionMuxAssetId).single();
                    await serviceClient
                        .from('webhook_events')
                        .update({ processed: true, processed_at: new Date().toISOString(), asset_id: asset?.id || null })
                        .eq('event_id', event.id);
                    console.log(`Marked static_rendition.ready webhook event ${event.id} as processed (did not trigger transcription).`);
                 } catch (markError) {
                    console.error(`Error marking non-triggering static_rendition.ready webhook ${event.id} as processed:`, markError);
                 }
            }
        }
    }
    // --- End Static Rendition Ready Event ---
    
    else {
      // Handle other event types or just log them
      console.log(`Ignoring Mux event type: ${event.type} for primary action.`);
    }
    
    // Always acknowledge receipt of the webhook to Mux
    return corsJsonResponse({ 
      received: true, 
      type: event.type,
      message: 'Webhook received and stored for processing'
    });
    
  } catch (error: unknown) {
    console.error('Webhook processing error:', error);
    // Don't return detailed internal errors to the webhook sender
    return corsErrorResponse('Webhook handler failed', 500);
  }
} 