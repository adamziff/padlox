import { verifyMuxWebhook, getStaticRenditionDownloadUrl } from '@/lib/mux';
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
    const event = JSON.parse(rawBody) as MuxWebhookEvent;
    
    console.log(`Received webhook from Mux: ${event.type}`);
    
    // We'll store all webhook events for processing, but we'll only act immediately on specific types
    const serviceClient = await createServiceSupabaseClient();
    
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
    if (webhookTableExists) {
      try {
        const { error: insertError } = await serviceClient
          .from('webhook_events')
          .insert({
            event_type: event.type,
            event_id: event.id,
            payload: event,
            processed: false,
            mux_asset_id: event.data.id,
            mux_upload_id: event.data.upload_id || null
          });
          
        if (insertError) {
          console.error('Error storing webhook event:', insertError);
        } else {
          console.log('Successfully stored webhook event for later processing');
        }
      } catch (e) {
        console.error('Error inserting webhook event:', e);
      }
    }
    
    // For video.asset.ready events, try to update the corresponding asset if we can
    if (event.type === 'video.asset.ready') {
      console.log('Processing video.asset.ready event for asset:', event.data.id);
      
      // Extract upload ID and correlation ID for lookup
      const uploadId = event.data.upload_id;
      // Use type assertion for metadata which isn't in the type definition
      const correlationId = ((event.data as { metadata?: { correlation_id?: string } }).metadata?.correlation_id) || null;
      
      console.log('Asset details from webhook:', {
        assetId: event.data.id,
        uploadId,
        correlationId,
        playbackId: event.data.playback_ids?.[0]?.id
      });
      
      try {
        // IMPORTANT: Always store the webhook event in the database first for video.asset.ready events
        // This ensures we can process it later even if immediate processing fails
        if (webhookTableExists) {
          try {
            const { error: storeError } = await serviceClient
              .from('webhook_events')
              .insert({
                event_type: event.type,
                event_id: event.id,
                payload: event,
                mux_asset_id: event.data.id,
                mux_upload_id: uploadId,
                mux_correlation_id: correlationId
              });
              
            if (storeError) {
              console.error('Error storing webhook event for later processing:', storeError);
            } else {
              console.log('Successfully stored asset.ready webhook event');
            }
          } catch (storeErr) {
            console.error('Exception storing webhook event:', storeErr);
          }
        }
      
        // Now try to process it immediately using multiple lookup strategies
        // Try different ways to find the asset as a recovery mechanism
        let foundAsset = null;
        let findError = null;
      
        // 1. Try to find asset by mux_asset_id directly (exact match)
        if (!foundAsset) {
          const { data, error } = await serviceClient
            .from('assets')
            .select('*')
            .eq('mux_asset_id', event.data.id)
            .limit(1);
            
          if (error) {
            findError = error;
            console.error('Error finding asset by mux_asset_id:', error);
          } else if (data && data.length > 0) {
            foundAsset = data[0];
            console.log('Found asset by exact mux_asset_id match:', foundAsset.id);
          }
        }
        
        // 2. Try to find by correlation ID if available
        if (!foundAsset && correlationId) {
          const { data, error } = await serviceClient
            .from('assets')
            .select('*')
            .eq('mux_correlation_id', correlationId)
            .limit(1);
            
          if (error) {
            findError = error;
            console.error('Error finding asset by mux_correlation_id:', error);
          } else if (data && data.length > 0) {
            foundAsset = data[0];
            console.log('Found asset by mux_correlation_id:', foundAsset.id);
          }
        }
        
        // 3. Try to find asset where mux_asset_id matches upload_id
        if (!foundAsset && uploadId) {
          const { data, error } = await serviceClient
            .from('assets')
            .select('*')
            .eq('mux_asset_id', uploadId)
            .limit(1);
            
          if (error) {
            findError = error;
            console.error('Error finding asset by upload_id:', error);
          } else if (data && data.length > 0) {
            foundAsset = data[0];
            console.log('Found asset by upload_id as mux_asset_id:', foundAsset.id);
          }
        }
        
        // If we found an asset, update it with the new video information
        if (foundAsset) {
          const playbackId = event.data.playback_ids?.[0]?.id;
          
          console.log('Updating asset with playback ID:', playbackId);
          
          if (!playbackId) {
            console.error('No playback ID found in webhook event');
          } else {
            const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;
            
            const { error: updateError } = await serviceClient
              .from('assets')
              .update({
                mux_processing_status: 'ready',
                mux_playback_id: playbackId,
                mux_max_resolution: event.data.max_stored_resolution,
                mux_aspect_ratio: event.data.aspect_ratio,
                mux_duration: event.data.duration,
                media_url: streamUrl,
                mux_asset_id: event.data.id,
                last_updated: new Date().toISOString(),
                // Set transcript status to pending since we expect audio to be generated
                transcript_processing_status: 'pending'
              })
              .eq('id', foundAsset.id);
          
            if (!updateError) {
              console.log('Successfully updated asset with new playback information');
              
              // Mark the webhook as processed now that we've updated the asset
              try {
                if (webhookTableExists) {
                  await serviceClient
                    .from('webhook_events')
                    .update({ 
                      processed: true, 
                      processed_at: new Date().toISOString(),
                      asset_id: foundAsset.id 
                    })
                    .eq('event_id', event.id);
                    
                  console.log('Marked webhook event as processed');
                }
              } catch (markError) {
                console.error('Error marking webhook as processed:', markError);
              }
            } else {
              console.error('Error updating asset:', updateError);
            }
          }
        } else {
          console.log('No asset found for this webhook event. Leaving in unprocessed state for retry.');
        }
      } catch (e) {
        console.error('Error processing asset update:', e);
      }
    }
    
    // Process static rendition ready event
    if (event.type === 'video.asset.static_rendition.ready') {
      console.log('Processing static rendition ready event:', event.data.id);
      
      try {
        // Store the webhook event for processing
        if (webhookTableExists) {
          const { error: storeError } = await serviceClient
            .from('webhook_events')
            .insert({
              event_type: event.type,
              event_id: event.id,
              payload: event,
              mux_asset_id: event.data.asset_id,
              processed: false
            });
            
          if (storeError) {
            console.error('Error storing static rendition webhook event:', storeError);
          } else {
            console.log('Successfully stored static rendition webhook event');
          }
        }
        
        // Check if this is an audio.m4a rendition
        const renditionName = event.data.name;
        const assetId = event.data.asset_id;
        const renditionId = event.data.id;
        
        console.log(`Processing rendition: ${renditionName}, assetId: ${assetId}, renditionId: ${renditionId}`);
        
        if (renditionName === 'audio.m4a' && assetId) {
          console.log(`Audio rendition ready for asset: ${assetId}`);
          
          // Find the asset by mux_asset_id
          const { data: assets, error: findError } = await serviceClient
            .from('assets')
            .select('*')
            .eq('mux_asset_id', assetId)
            .limit(1);
            
          if (findError) {
            console.error('Error finding asset for audio rendition:', findError);
          } else if (assets && assets.length > 0) {
            const asset = assets[0];
            console.log(`Found asset for audio rendition: ${asset.id}`);
            
            try {
              // Set pending URL format for now - the actual URL will be constructed during transcription
              // This follows format: "pending:{assetId}/{renditionId}/{renditionName}"
              const pendingUrl = `pending:${assetId}/${renditionId}/${renditionName}`;
              
              // Update the asset with the pending URL and set transcript status to pending
              const { error: updateError } = await serviceClient
                .from('assets')
                .update({
                  mux_audio_url: pendingUrl,
                  transcript_processing_status: 'pending',
                  last_updated: new Date().toISOString()
                })
                .eq('id', asset.id);
                
              if (updateError) {
                console.error('Error updating asset with audio URL:', updateError);
              } else {
                console.log('Updated asset with pending audio URL, initiating transcription');
                
                // Call the transcription API endpoint
                try {
                  const transcribeResponse = await fetch(
                    `${process.env.NEXT_PUBLIC_SITE_URL}/api/transcribe`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
                      },
                      body: JSON.stringify({ assetId: asset.id })
                    }
                  );
                  
                  if (transcribeResponse.ok) {
                    console.log('Successfully initiated transcription process');
                  } else {
                    const errorData = await transcribeResponse.json().catch(() => ({}));
                    console.error('Error initiating transcription:', errorData);
                  }
                } catch (transcribeError) {
                  console.error('Exception calling transcribe API:', transcribeError);
                }
                
                // Mark the webhook as processed
                if (webhookTableExists) {
                  await serviceClient
                    .from('webhook_events')
                    .update({ 
                      processed: true, 
                      processed_at: new Date().toISOString(),
                      asset_id: asset.id 
                    })
                    .eq('event_id', event.id);
                    
                  console.log('Marked static rendition webhook event as processed');
                }
              }
            } catch (error) {
              console.error('Error processing audio rendition:', error);
            }
          } else {
            console.log('No asset found for audio rendition webhook');
          }
        } else {
          console.log(`Received static rendition event for: ${renditionName}`);
        }
      } catch (processError) {
        console.error('Error processing static rendition webhook:', processError);
      }
    }
    
    // Call the SQL function to process any static rendition webhooks that need processing
    try {
      await serviceClient.rpc('process_static_rendition_webhooks');
    } catch (sqlError) {
      console.error('Error calling process_static_rendition_webhooks function:', sqlError);
    }
    
    // Always acknowledge receipt of the webhook to Mux
    return corsJsonResponse({ 
      received: true, 
      type: event.type,
      message: 'Webhook received and stored for processing'
    });
    
  } catch (error) {
    console.error('Error processing Mux webhook:', error);
    return corsErrorResponse('Internal server error', 500);
  }
} 