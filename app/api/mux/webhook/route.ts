import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMuxWebhook } from '@/utils/mux';
import { MuxWebhookEvent } from '@/types/mux';

// Create a direct Supabase client with the service role key to bypass RLS for webhook events storage only
function createServiceClient() {
  // Only use this for the webhook_events table, not for user data
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('No SUPABASE_SERVICE_ROLE_KEY available for webhook processing');
    // Fall back to anon key in development for testing
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        // Configure client for realtime
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'X-Client-Info': 'webhook-handler',
          },
        },
      }
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      // Configure client for realtime
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'X-Client-Info': 'webhook-handler-service',
        },
      },
    }
  );
}

// Add support for OPTIONS method (for CORS preflight requests)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Mux-Signature',
    },
  });
}

// Add support for GET method (for webhook validation)
export async function GET() {
  return NextResponse.json({ message: 'Mux webhook endpoint is active' });
}

// Handle Mux webhook notifications
export async function POST(request: Request) {
  try {
    // Get the Mux signature header
    const muxSignature = request.headers.get('Mux-Signature') || '';
    
    // Read the request body as text
    const rawBody = await request.text();
    
    console.log('Received webhook from Mux:', rawBody.substring(0, 200) + '...');
    
    // Verify the webhook signature in production
    if (process.env.NODE_ENV === 'production') {
      if (!verifyMuxWebhook(rawBody, muxSignature, process.env.MUX_TOKEN_SECRET!)) {
        console.error('Invalid Mux webhook signature');
        return new NextResponse('Invalid signature', { status: 401 });
      }
    }
    
    // Parse the webhook payload
    const event = JSON.parse(rawBody) as MuxWebhookEvent;
    
    console.log('Webhook event type:', event.type);
    
    // We'll store all webhook events for processing, but we'll only act immediately on specific types
    const serviceClient = createServiceClient();
    
    // Store the webhook event for later processing
    // First, check if a webhook_events table exists
    try {
      const { error: tableCheckError } = await serviceClient
        .from('webhook_events')
        .select('id')
        .limit(1);
        
      // If the table doesn't exist, we'll need to create it
      if (tableCheckError && tableCheckError.code === '42P01') { // Table doesn't exist
        console.log('webhook_events table does not exist, attempting to create it');
        
        // Create the webhook_events table using SQL (we need service role for this)
        const { error: createTableError } = await serviceClient.rpc('create_webhook_events_table');
        
        if (createTableError) {
          console.error('Error creating webhook_events table:', createTableError);
          // Continue anyway, we'll just return a message to Mux so it doesn't retry
        }
      }
    } catch (e) {
      console.error('Error checking webhook_events table:', e);
    }
    
    // Store the webhook event
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
        // IMPORTANT: Always store the webhook event in the database first
        // This ensures we can process it later even if immediate processing fails
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
            console.log('Successfully stored webhook event for later processing');
          }
        } catch (storeErr) {
          console.error('Exception storing webhook event:', storeErr);
        }
      
        // Now try to process it immediately using multiple lookup strategies
        // Try different ways to find the asset as a recovery mechanism
        let foundAsset = null;
        let findError = null;
        
        // Strategy 1: Find by upload ID (most direct match)
        if (uploadId) {
          const result = await serviceClient
            .from('assets')
            .select('id, user_id, mux_asset_id, mux_processing_status, client_reference_id, mux_correlation_id')
            .eq('mux_asset_id', uploadId)
            .maybeSingle();
          
          if (result.data) {
            foundAsset = result.data;
            console.log('Found asset using upload ID match:', foundAsset.id);
          } else {
            findError = result.error;
            console.log('No asset found with upload ID:', uploadId);
          }
        }
        
        // Strategy 2: If we have a correlation ID and didn't find by upload ID, try that
        if (!foundAsset && correlationId) {
          const result = await serviceClient
            .from('assets')
            .select('id, user_id, mux_asset_id, mux_processing_status, client_reference_id, mux_correlation_id')
            .eq('mux_correlation_id', correlationId)
            .maybeSingle();
          
          if (result.data) {
            foundAsset = result.data;
            console.log('Found asset using correlation ID match:', foundAsset.id);
          } else {
            console.log('No asset found with correlation ID:', correlationId);
          }
        }
          
        if (findError) {
          console.error('Error finding asset by identifiers:', findError);
        }
        
        if (foundAsset) {
          console.log('Found asset to update:', foundAsset.id, 
            'owned by user:', foundAsset.user_id, 
            'current status:', foundAsset.mux_processing_status);
          
          // Get playback ID
          const playbackId = event.data.playback_ids?.[0]?.id;
          
          if (!playbackId) {
            console.error('No playback ID found in webhook payload');
          } else {
            // Update the asset with the ready status and Mux metadata
            const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;
            
            // Using service client to update by ID (bypassing RLS for this specific operation)
            // This maintains security while allowing webhooks to update assets
            console.log('Updating asset in database:', foundAsset.id);

            const updateData = {
              mux_processing_status: 'ready',
              mux_playback_id: playbackId,
              mux_max_resolution: event.data.max_stored_resolution,
              mux_aspect_ratio: event.data.aspect_ratio,
              mux_duration: event.data.duration,
              media_url: streamUrl,
              mux_asset_id: event.data.id, // Update with the actual asset ID
              last_updated: new Date().toISOString()
            };

            // Standard update with service client
            const { error: updateError } = await serviceClient
              .from('assets')
              .update(updateData)
              .eq('id', foundAsset.id);

            // After updating the asset, send a broadcast via EventSource to ensure clients get updated
            if (!updateError) {
              console.log('Successfully updated asset with stream URL:', streamUrl);
              
              // Wait briefly and send a second update to ensure clients refresh
              await new Promise(resolve => setTimeout(resolve, 300));
              
              try {
                // Send a small update to trigger another realtime update
                await serviceClient
                  .from('assets')
                  .update({ 
                    last_updated: new Date().toISOString() 
                  })
                  .eq('id', foundAsset.id);
                  
                console.log('Sent additional update notification for asset:', foundAsset.id);
                
                // Broadcast to the specific channel for this asset
                try {
                  await serviceClient
                    .channel(`asset-${foundAsset.id}-changes`)
                    .send({
                      type: 'broadcast',
                      event: 'asset-ready',
                      payload: { 
                        id: foundAsset.id,
                        status: 'ready',
                        message: 'Video processing completed'
                      }
                    });
                    
                  console.log('Broadcast sent for asset:', foundAsset.id);
                } catch (broadcastError) {
                  console.error('Error broadcasting update:', broadcastError);
                }
              } catch (additionalError) {
                console.error('Error sending additional notification:', additionalError);
              }
              
              // Mark the webhook as processed now that we've updated the asset
              try {
                await serviceClient
                  .from('webhook_events')
                  .update({ 
                    processed: true, 
                    processed_at: new Date().toISOString(),
                    asset_id: foundAsset.id 
                  })
                  .eq('event_id', event.id);
                  
                console.log('Marked webhook event as processed');
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
    
    // Always acknowledge receipt of the webhook to Mux
    return NextResponse.json({ 
      received: true, 
      type: event.type,
      message: 'Webhook received and stored for processing'
    });
    
  } catch (error) {
    console.error('Error processing Mux webhook:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
} 