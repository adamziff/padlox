import { createMuxPlaybackJWT } from '@/utils/mux';
import { jsonResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { withAuth } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { User } from '@supabase/supabase-js';

// Helper for controlled logging
function log(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
    console.log(`[TokenAPI] ${message}`, ...args);
  }
}

// Helper function to create tokens for different purposes using RSA signing
async function createTokensForPlayback(playbackId: string, userId: string) {
  if (!process.env.MUX_SIGNING_KEY_ID || !process.env.MUX_SIGNING_PRIVATE_KEY) {
    throw new Error('Missing MUX signing configuration');
  }

  try {
    // Create playback token (audience = 'v')
    log(`Creating tokens for playback ID: ${playbackId}`);
    const playbackToken = await createMuxPlaybackJWT(playbackId, userId, 'v');
    
    // Create thumbnail token (audience = 't')
    const thumbnailToken = await createMuxPlaybackJWT(playbackId, userId, 't');
    
    // Create storyboard token (audience = 's')
    const storyboardToken = await createMuxPlaybackJWT(playbackId, userId, 's');
    
    // Return all three tokens
    return {
      playback: playbackToken,
      thumbnail: thumbnailToken,
      storyboard: storyboardToken
    };
  } catch (error) {
    console.error('Error creating tokens:', error);
    throw error;
  }
}

export const GET = withAuth(async (request: Request) => {
  try {
    // User is available from middleware extension
    const user = (request as Request & { user: User }).user;

    // Get the playback ID from the request
    const { searchParams } = new URL(request.url);
    const playbackId = searchParams.get('playbackId');

    if (!playbackId) {
      console.error('Missing playback ID in request');
      return errorResponse('Missing playback ID', 400);
    }

    log(`Generating tokens for playback ID: ${playbackId}`);

    // Create a supabase client for the server context
    const supabase = await createServiceSupabaseClient();

    // Try to access with user session first
    const { data: assets, error: queryError } = await supabase
      .from('assets')
      .select('id, mux_playback_id')
      .eq('mux_playback_id', playbackId)
      .eq('user_id', user.id)
      .limit(1);

    if (queryError) {
      console.error('Database error:', queryError);
      return errorResponse('Database error', 500);
    }

    if (!assets || assets.length === 0) {
      console.error('Access denied or video not found');
      return notFoundResponse('Video not found or access denied');
    }

    log('Asset found, generating tokens');

    // Generate tokens for all required purposes
    try {
      const tokens = await createTokensForPlayback(playbackId, user.id);
      log('Tokens generated successfully');

      // Return all tokens to the client
      return jsonResponse({ 
        token: tokens.playback,  // For backward compatibility
        tokens: tokens,
        playbackId: playbackId
      });
    } catch (tokenError) {
      console.error('Failed to generate tokens:', tokenError);
      return errorResponse(
        'Token generation failed', 
        500, 
        { details: tokenError instanceof Error ? tokenError.message : 'Unknown error' }
      );
    }
  } catch (error) {
    console.error('Error generating token:', error);
    return errorResponse(
      'Internal server error',
      500,
      { details: error instanceof Error ? error.message : 'Unknown error' }
    );
  }
}); 