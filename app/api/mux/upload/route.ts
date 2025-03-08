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
      const { metadata, correlationId } = await request.json();

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
      
      // Create a Mux upload with the correlation ID if provided
      const uploadData = await createMuxUpload(correlationId);
      
      console.log('Mux upload created:', {
        assetId: uploadData.assetId,
        correlationId: uploadData.correlationId
      });

      if (!uploadData.uploadUrl) {
        throw new Error('No upload URL received from Mux');
      }

      // Generate a unique client-side reference ID to help track this asset
      const clientReferenceId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create a pending asset in Supabase with additional tracking fields
      const { data: asset, error: dbError } = await supabase
        .from('assets')
        .insert([{
          user_id: user.id,
          name: metadata.name,
          description: metadata.description || null,
          estimated_value: metadata.estimated_value || null,
          media_url: '', // Will be updated once Mux processes the video
          media_type: 'video',
          mux_asset_id: uploadData.assetId, // Store the upload ID initially (important for webhook matching)
          mux_playback_id: '', // This will be set by the webhook when processing is complete
          mux_processing_status: 'preparing',
          // Add extra fields to help with tracking and recovery
          client_reference_id: clientReferenceId,
          mux_correlation_id: uploadData.correlationId,
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
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
      
      // Log the created asset
      console.log('Created asset in database:', {
        id: asset.id,
        name: asset.name,
        media_type: asset.media_type,
        mux_asset_id: asset.mux_asset_id,
        assetId: uploadData.assetId,
        correlationId: uploadData.correlationId,
        clientReferenceId: clientReferenceId,
        database_url: process.env.NEXT_PUBLIC_SUPABASE_URL
      });
      
      // Verify the asset was created by doing a select
      const { data: verifyAsset, error: verifyError } = await supabase
        .from('assets')
        .select('id, name, media_type, mux_asset_id, client_reference_id, mux_correlation_id')
        .eq('id', asset.id)
        .single();
        
      if (verifyError) {
        console.error('Error verifying asset creation:', verifyError);
      } else {
        console.log('Verified asset exists:', verifyAsset);
      }

      return NextResponse.json({
        uploadUrl: uploadData.uploadUrl,
        assetId: uploadData.assetId,
        playbackId: uploadData.playbackId,
        correlationId: uploadData.correlationId,
        clientReferenceId: clientReferenceId,
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