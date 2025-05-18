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
    // For static rendition events, use data.asset_id as that's the actual asset ID we need
    let muxAssetId = null;
    if (event.type === 'video.static_rendition.ready' || event.type === 'video.asset.static_rendition.ready') {
      muxAssetId = event.data?.asset_id || null;
      console.log(`Using data.asset_id (${muxAssetId}) for static rendition event`);
    } else {
      muxAssetId = event.data?.id || event.data?.asset_id || null; // Use asset_id as fallback if top-level id is missing
    }
    
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
              
              // Find the asset record to get its user ID
              const { data: asset, error: assetFetchError } = await serviceClient
                  .from('assets')
                  .select('id, user_id')
                  .eq('mux_asset_id', muxAssetId)
                  .single();
                  
              if (assetFetchError || !asset) {
                  console.error(`Error fetching asset details for Mux asset ${muxAssetId}:`, assetFetchError);
              } else {
                  const userId = asset.user_id;
                  
                  // Update any scratch items for this session with the correct mux_asset_id and user_id
                  console.log(`Updating scratch items for user ${userId} with Mux asset ID ${muxAssetId}`);
                  
                  // Check if there are any scratch items with matching session ID but missing mux_asset_id
                  const { data: scratchItemsToUpdate, error: scratchFetchError } = await serviceClient
                      .from('scratch_items')
                      .select('*')
                      .is('mux_asset_id', null); // Find items without mux_asset_id
                      
                  if (scratchFetchError) {
                      console.error(`Error fetching scratch items to update for Mux asset ${muxAssetId}:`, scratchFetchError);
                  } else if (scratchItemsToUpdate && scratchItemsToUpdate.length > 0) {
                      console.log(`Found ${scratchItemsToUpdate.length} scratch items to update with Mux asset ID ${muxAssetId}`);
                      
                      // Update the scratch items with the mux_asset_id and user_id
                      const { error: scratchUpdateError } = await serviceClient
                          .from('scratch_items')
                          .update({
                              mux_asset_id: muxAssetId,
                              user_id: userId
                          })
                          .is('mux_asset_id', null); // Update only items without mux_asset_id
                          
                      if (scratchUpdateError) {
                          console.error(`Error updating scratch items with Mux asset ID ${muxAssetId}:`, scratchUpdateError);
                      } else {
                          console.log(`Successfully updated scratch items with Mux asset ID ${muxAssetId} and user ID ${userId}`);
                      }
                  } else {
                      console.log(`No scratch items found to update for Mux asset ${muxAssetId}`);
                  }
              }
              
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
    if ((event.type === 'video.static_rendition.ready' || event.type === 'video.asset.static_rendition.ready') && muxAssetId) {
      console.log(`Processing static rendition ready event for Mux Asset ID: ${muxAssetId}`);
      
      try {
          // This is the event that triggers automatic transcription
          // Get the current asset info
          const { data: asset, error: assetError } = await serviceClient
              .from('assets')
              .select('id, user_id, mux_asset_id, transcript_processing_status')
              .eq('mux_asset_id', muxAssetId)
              .single();
          
          if (assetError || !asset) {
              console.error(`Error fetching asset for static rendition event (Mux Asset ID: ${muxAssetId}):`, assetError);
          } else {
              console.log(`Found asset ${asset.id} for Mux Asset ID: ${muxAssetId}`);
              
              // Check if transcription is already pending/processing/completed
              const transcriptionStatus = asset.transcript_processing_status || null;
              console.log(`Current transcription status for asset ${asset.id}: ${transcriptionStatus || 'null'}`);
              
              if (transcriptionStatus === 'completed') {
                  console.log(`Transcription already completed for asset ${asset.id}, checking if we need to merge with scratch items...`);
                  
                  // Check if there are scratch items to merge with the transcript
                  const { data: scratchItems, error: scratchError } = await serviceClient
                      .from('scratch_items')
                      .select('*')
                      .eq('mux_asset_id', muxAssetId);
                      
                  if (scratchError) {
                      console.error(`Error checking for scratch items for asset ${asset.id}:`, scratchError);
                  } else if (scratchItems && scratchItems.length > 0) {
                      console.log(`Found ${scratchItems.length} scratch items for asset ${asset.id}, triggering merge...`);
                      console.log(`Scratch items for merge: ${JSON.stringify(scratchItems.map(item => ({ id: item.id, name: item.name, timestamp: item.video_timestamp })))}`);
                      
                      // Get the transcript text
                      const { data: assetWithTranscript, error: transcriptError } = await serviceClient
                          .from('assets')
                          .select('transcript_text')
                          .eq('id', asset.id)
                          .single();
                          
                      if (transcriptError || !assetWithTranscript?.transcript_text) {
                          console.error(`Error fetching transcript text for asset ${asset.id}:`, transcriptError);
                      } else {
                          console.log(`Found transcript for asset ${asset.id}, length: ${assetWithTranscript.transcript_text.length} chars`);
                          
                          // Call the merge API
                          const mergeUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/analyze-transcript/merge-with-scratch`;
                          console.log(`Calling merge API at: ${mergeUrl}`);
                          
                          const requestBody = {
                              user_id: asset.user_id,
                              asset_id: asset.id,
                              mux_asset_id: muxAssetId,
                              transcript: assetWithTranscript.transcript_text
                          };
                          
                          console.log(`Merge request payload: ${JSON.stringify({
                              user_id: asset.user_id,
                              asset_id: asset.id,
                              mux_asset_id: muxAssetId,
                              transcript_length: assetWithTranscript.transcript_text.length
                          })}`);
                          
                          try {
                              const mergeResponse = await fetch(mergeUrl, {
                                  method: 'POST',
                                  headers: { 
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${process.env.API_SECRET_KEY || ''}`
                                  },
                                  body: JSON.stringify(requestBody)
                              });
                              
                              if (!mergeResponse.ok) {
                                  const errorText = await mergeResponse.text();
                                  console.error(`Error merging transcript with scratch items for asset ${asset.id}: ${errorText}`);
                                  console.error(`Merge failed with status: ${mergeResponse.status}`);
                              } else {
                                  const mergeResult = await mergeResponse.json();
                                  console.log(`Successfully merged transcript with scratch items for asset ${asset.id}. Found ${mergeResult.items?.length || 0} items.`);
                                  console.log(`Merge result: ${JSON.stringify(mergeResult)}`);
                              }
                          } catch (error) {
                              console.error(`Exception triggering transcript merge for asset ${asset.id}:`, error);
                          }
                      }
                  } else {
                      console.log(`No scratch items found for asset ${asset.id}, skipping merge. Query used: mux_asset_id=${muxAssetId}`);
                  }
              } else if (transcriptionStatus === 'pending' || transcriptionStatus === 'processing') {
                  console.log(`Transcription already ${transcriptionStatus} for asset ${asset.id}, skipping duplicate trigger.`);
              } else {
                  // Original logic to trigger transcription
                  console.log(`Asset ${asset.id} audio rendition ready. Updating status and triggering transcription.`);
                  
                  // Get rendition details needed for the pending URL
                  const renditionId = event.data?.id; // ID of the rendition itself
                  const renditionName = event.data?.name;
                  
                  if (!renditionId) {
                    console.error(`Missing rendition ID in static_rendition.ready event payload for asset ${asset.id}. Cannot proceed.`);
                    // Mark as processed with error
                    if (webhookTableExists) {
                       try {
                          await serviceClient.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString(), asset_id: asset.id }).eq('event_id', event.id);
                          console.log(`Marked static_rendition.ready webhook event ${event.id} as processed (missing rendition ID).`);
                       } catch (markError) { console.error(`Error marking static_rendition.ready webhook ${event.id} as processed after missing rendition ID:`, markError); }
                    }
                    return; // Stop processing this event
                  }
                  
                  const pendingAudioUrl = `pending:${muxAssetId}/${renditionId}/${renditionName}`;
                  console.log(`Constructed pending audio URL: ${pendingAudioUrl}`);
                  
                  // Update the asset's status and store the pending URL *before* triggering
                  const { error: updateError } = await serviceClient
                     .from('assets')
                      .update({
                         transcript_processing_status: 'pending',
                         mux_audio_url: pendingAudioUrl, // Store the pending URL
                         last_updated: new Date().toISOString()
                      })
                      .eq('id', asset.id);

                  if (updateError) {
                      console.error(`Error setting transcript status to 'pending' for asset ${asset.id} via static_rendition.ready:`, updateError);
                  } else {
                      console.log(`Set transcript status to 'pending' for asset ${asset.id} via static_rendition.ready.`);
                      
                      // Trigger the transcription API
                      try {
                          console.log(`Calling transcription API at: ${process.env.NEXT_PUBLIC_SITE_URL}/api/transcribe`);
                          const transcribeResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/transcribe`, {
                               method: 'POST',
                               headers: {
                                   'Content-Type': 'application/json',
                                   'Authorization': `Bearer ${process.env.API_SECRET_KEY || ''}`,
                               },
                               body: JSON.stringify({ assetId: asset.id }), // Pass internal DB asset ID
                          });
                          
                          if (!transcribeResponse.ok) {
                              const errorBody = await transcribeResponse.text().catch(() => 'Failed to read error body');
                              console.error(`Error triggering transcription for asset ${asset.id} from static_rendition.ready: ${transcribeResponse.status} ${transcribeResponse.statusText} - ${errorBody}`);
                          } else {
                              console.log(`Successfully triggered transcription for asset ${asset.id} from static_rendition.ready`);
                          }
                      } catch (err) {
                          console.error(`Fetch error triggering transcription for asset ${asset.id} from static_rendition.ready:`, err);
                      }
                  }
              }
              
              // Mark webhook as processed
              if (webhookTableExists) {
                  try {
                      await serviceClient
                          .from('webhook_events')
                          .update({ processed: true, processed_at: new Date().toISOString(), asset_id: asset.id })
                          .eq('event_id', event.id);
                      console.log(`Marked static_rendition.ready webhook event ${event.id} as processed.`);
                  } catch (markError) {
                      console.error(`Error marking static_rendition.ready webhook ${event.id} as processed:`, markError);
                  }
              }
          }
      } catch (error) {
          console.error(`Exception during static_rendition.ready processing for Mux Asset ID: ${muxAssetId}:`, error);
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