import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { verifyMuxWebhook } from '@/utils/mux';
import { MuxWebhookEvent } from '@/types/mux';

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
    
    // Only process video.asset.ready events
    if (event.type !== 'video.asset.ready') {
      console.log('Ignoring non-ready event');
      return NextResponse.json({ received: true, type: event.type });
    }
    
    console.log('Processing video.asset.ready event for asset:', event.data.id);
    
    if (!event.data.id) {
      console.error('Missing asset ID in webhook payload');
      return new NextResponse('Invalid payload', { status: 400 });
    }
    
    // Access Supabase to update the asset status
    const supabase = await createClient();
    
    // Find the asset by the Mux asset ID - first try direct match
    const { data: assets, error: findError } = await supabase
      .from('assets')
      .select('*')
      .eq('mux_asset_id', event.data.id)
      .limit(1);
    
    if (findError) {
      console.error('Database error finding asset:', findError);
      return new NextResponse('Database error', { status: 500 });
    }
    
    // If not found and we have an upload ID, try that
    let asset;
    if (!assets || assets.length === 0) {
      console.log('Asset not found by Mux asset ID, checking upload ID');
      
      if (event.data.upload_id) {
        const { data: uploadAssets, error: uploadFindError } = await supabase
          .from('assets')
          .select('*')
          .eq('mux_asset_id', event.data.upload_id)
          .limit(1);
          
        if (uploadFindError) {
          console.error('Database error finding asset by upload ID:', uploadFindError);
          return new NextResponse('Database error', { status: 500 });
        }
        
        if (uploadAssets && uploadAssets.length > 0) {
          console.log('Found asset by upload ID:', uploadAssets[0].id);
          asset = uploadAssets[0];
        } else {
          console.error('Asset not found for Mux asset ID or upload ID');
          return new NextResponse('Asset not found', { status: 404 });
        }
      } else {
        console.error('Asset not found and no upload ID available');
        return new NextResponse('Asset not found', { status: 404 });
      }
    } else {
      asset = assets[0];
      console.log('Found asset by Mux asset ID:', asset.id);
    }
    
    const playbackId = event.data.playback_ids?.[0]?.id;
    
    if (!playbackId) {
      console.error('No playback ID found in webhook payload');
      return new NextResponse('No playback ID', { status: 400 });
    }
    
    console.log('Updating asset:', asset.id, 'with playback ID:', playbackId);
    
    // Construct the Mux streaming URL
    const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`; 
    
    // Update the asset with the ready status and Mux metadata
    const { error: updateError } = await supabase
      .from('assets')
      .update({
        mux_processing_status: 'ready',
        mux_playback_id: playbackId,
        mux_max_resolution: event.data.max_stored_resolution,
        mux_aspect_ratio: event.data.aspect_ratio,
        mux_duration: event.data.duration,
        media_url: streamUrl, // Update the media_url to point to the Mux stream
        mux_asset_id: event.data.id // Update with the actual asset ID
      })
      .eq('id', asset.id);
    
    if (updateError) {
      console.error('Error updating asset:', updateError);
      return new NextResponse('Database error', { status: 500 });
    }
    
    console.log('Asset updated successfully with streamUrl:', streamUrl);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing Mux webhook:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
} 