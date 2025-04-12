import { createMuxUpload } from '@/lib/mux';
import { corsJsonResponse, corsErrorResponse } from '@/lib/api/response';
import { withAuth } from '@/lib/api/auth';
import { createClient } from '@/utils/supabase/server';
import { parseJsonBody, ValidationError } from '@/lib/api/validation';
import { User } from '@supabase/supabase-js';

export const POST = withAuth(async (request: Request) => {
  try {
    // User is available from middleware extension
    const user = (request as Request & { user: User }).user;

    try {
      // Get metadata from the request
      interface UploadRequest {
        metadata: {
          name: string;
          description?: string | null;
          estimated_value?: number | null;
        };
        correlationId?: string;
      }
      
      const { metadata, correlationId } = await parseJsonBody<UploadRequest>(request);

      if (!metadata || !metadata.name) {
        console.error('Invalid metadata:', metadata);
        return corsErrorResponse('Invalid metadata', 400);
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

      // Create a supabase client for the server context
      const supabase = await createClient();

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

      return corsJsonResponse({
        uploadUrl: uploadData.uploadUrl,
        assetId: uploadData.assetId,
        playbackId: uploadData.playbackId,
        correlationId: uploadData.correlationId,
        clientReferenceId: clientReferenceId,
        asset: asset
      });
    } catch (innerError) {
      console.error('Inner operation error:', innerError);
      
      if (innerError instanceof ValidationError) {
        return corsErrorResponse(innerError.message, 400, innerError.details);
      }
      
      throw innerError;
    }
  } catch (error: unknown) {
    console.error('Upload error:', error);
    
    const err = error as Error & {
      details?: string;
      hint?: string;
      code?: string;
    };
    
    return corsErrorResponse(
      'Upload failed',
      500,
      {
        message: err?.message || 'Unknown error',
        stack: err?.stack
      }
    );
  }
});

// Add OPTIONS handler for CORS
export const OPTIONS = () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}; 