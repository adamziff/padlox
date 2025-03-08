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
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
    if (event.type === 'video.asset.ready' && event.data.upload_id) {
      console.log('Processing video.asset.ready event for asset:', event.data.id);
      console.log('Upload ID from webhook:', event.data.upload_id);
      
      try {
        // Find the asset by mux_asset_id matching the upload_id using serviceClient
        // This bypasses RLS just for the lookup
        const { data: foundAsset, error: findError } = await serviceClient
          .from('assets')
          .select('id, user_id, mux_asset_id')
          .eq('mux_asset_id', event.data.upload_id)
          .maybeSingle();
          
        if (findError) {
          console.error('Error finding asset by upload ID:', findError);
        } else if (foundAsset) {
          console.log('Found asset to update:', foundAsset.id, 'owned by user:', foundAsset.user_id);
          
          // Get playback ID
          const playbackId = event.data.playback_ids?.[0]?.id;
          
          if (!playbackId) {
            console.error('No playback ID found in webhook payload');
          } else {
            // Update the asset with the ready status and Mux metadata
            const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;
            
            // Using service client to update by ID (bypassing RLS for this specific operation)
            // This maintains security while allowing webhooks to update assets
            const { error: updateError } = await serviceClient
              .from('assets')
              .update({
                mux_processing_status: 'ready',
                mux_playback_id: playbackId,
                mux_max_resolution: event.data.max_stored_resolution,
                mux_aspect_ratio: event.data.aspect_ratio,
                mux_duration: event.data.duration,
                media_url: streamUrl,
                mux_asset_id: event.data.id // Update with the actual asset ID
              })
              .eq('id', foundAsset.id);
              
            if (updateError) {
              console.error('Error updating asset:', updateError);
            } else {
              console.log('Successfully updated asset with stream URL:', streamUrl);
            }
          }
        } else {
          console.log('No asset found with mux_asset_id matching upload_id:', event.data.upload_id);
          console.log('Event stored for later processing');
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