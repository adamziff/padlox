import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createMuxUpload } from '@/utils/mux';

export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.error('Authentication error:', error);
      return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
      // Get metadata from the request
      const { metadata } = await request.json();

      if (!metadata || !metadata.name) {
        console.error('Invalid metadata:', metadata);
        return new NextResponse('Invalid metadata', { status: 400 });
      }

      console.log('Creating Mux upload with metadata:', metadata);
      console.log('Environment:', { 
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        MUX_TOKEN_ID_SET: !!process.env.MUX_TOKEN_ID,
        MUX_TOKEN_SECRET_SET: !!process.env.MUX_TOKEN_SECRET
      });
      
      // Create a Mux upload
      const uploadData = await createMuxUpload();
      
      console.log('Mux upload created:', uploadData);

      if (!uploadData.uploadUrl) {
        throw new Error('No upload URL received from Mux');
      }

      // Create a pending asset in Supabase
      const { data: asset, error: dbError } = await supabase
        .from('assets')
        .insert([{
          user_id: user.id,
          name: metadata.name,
          description: metadata.description || null,
          estimated_value: metadata.estimated_value || null,
          media_url: '', // Will be updated once Mux processes the video
          media_type: 'video',
          mux_asset_id: uploadData.assetId, // Store the upload ID here, will be updated by webhook
          mux_playback_id: uploadData.playbackId,
          mux_processing_status: 'preparing',
        }])
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', {
          message: dbError.message,
          details: dbError.details,
          hint: dbError.hint,
          code: dbError.code
        });
        throw dbError;
      }

      return NextResponse.json({
        uploadUrl: uploadData.uploadUrl,
        assetId: uploadData.assetId,
        playbackId: uploadData.playbackId,
        asset: asset
      });
    } catch (innerError) {
      console.error('Inner operation error:', innerError);
      throw innerError;
    }
  } catch (error: unknown) {
    console.error('Upload error:', error);
    
    const err = error as Error & {
      details?: string;
      hint?: string;
      code?: string;
    };
    
    return new NextResponse(
      JSON.stringify({ 
        error: 'Upload failed', 
        details: err?.message || 'Unknown error',
        stack: err?.stack
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 