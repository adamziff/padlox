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

    console.log("--- DETAILED WEBHOOK DEBUGGING ---");
    
    // First, get ALL video assets to see what's in there (limited to 10)
    const { data: allVideos, error: videosError } = await supabase
      .from('assets')
      .select('id, media_type, mux_asset_id, created_at')
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (videosError) {
      console.error('Error loading videos:', videosError);
    } else {
      console.log('ALL RECENT VIDEO ASSETS:', JSON.stringify(allVideos, null, 2));
    }
    
    // Log the upload ID we're looking for
    if (event.data.upload_id) {
      console.log(`UPLOAD ID FROM WEBHOOK: "${event.data.upload_id}"`);
      
      // Try to find assets with similar IDs using a direct query
      const { data: likeAssets, error: likeError } = await supabase
        .from('assets')
        .select('id, mux_asset_id')
        .filter('mux_asset_id', 'ilike', `%${event.data.upload_id.substring(0, 10)}%`)
        .limit(5);
        
      if (likeError) {
        console.error('Error with pattern matching search:', likeError);
      } else {
        console.log('SIMILAR ID SEARCH RESULTS:', JSON.stringify(likeAssets, null, 2));
      }
    }
    
    // Simplify our search to just focus on the upload ID
    let asset = null;
    
    if (event.data.upload_id) {
      console.log('Looking for asset with mux_asset_id = upload_id:', event.data.upload_id);
      
      // SIMPLE EXACT MATCH
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
        console.log('FOUND ASSET BY EXACT UPLOAD ID MATCH:', uploadAssets[0].id);
        asset = uploadAssets[0];
      } else {
        console.log('No exact match found for upload_id, trying most recent prep asset');
        
        // FALLBACK TO MOST RECENT PREPARING ASSET
        const { data: recentAssets, error: recentError } = await supabase
          .from('assets')
          .select('*')
          .eq('media_type', 'video')
          .eq('mux_processing_status', 'preparing')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (recentError) {
          console.error('Error finding recent preparing asset:', recentError);
        } else if (recentAssets && recentAssets.length > 0) {
          console.log('FOUND MOST RECENT PREPARING ASSET:', recentAssets[0].id);
          console.log('Stored mux_asset_id:', recentAssets[0].mux_asset_id);
          asset = recentAssets[0];
        } else {
          // EMERGENCY FALLBACK - GRAB MOST RECENT VIDEO ASSET REGARDLESS OF STATUS
          console.log('No preparing assets found, trying most recent video asset');
          
          const { data: anyAssets, error: anyError } = await supabase
            .from('assets')
            .select('*')
            .eq('media_type', 'video')
            .order('created_at', { ascending: false })
            .limit(1);
            
          if (anyError) {
            console.error('Error finding any video asset:', anyError);
          } else if (anyAssets && anyAssets.length > 0) {
            console.log('FOUND MOST RECENT VIDEO ASSET AS FALLBACK:', anyAssets[0].id);
            asset = anyAssets[0];
          }
        }
      }
    }
    
    if (!asset) {
      console.error('No matching or recent video assets found');
      return new NextResponse('Asset not found', { status: 404 });
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