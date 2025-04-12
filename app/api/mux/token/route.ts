import { createMuxTokens } from '@/lib/mux';
import { jsonResponse, errorResponse, notFoundResponse } from '@/lib/api/response';
import { withAuth } from '@/lib/api/auth';
import { createClient } from '@/utils/supabase/server';
import { User } from '@supabase/supabase-js';

// Helper for controlled logging
function log(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
    console.log(`[TokenAPI] ${message}`, ...args);
  }
}

// Use the createMuxTokens function from the consolidated library

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

    // Use the client that handles cookies/user sessions
    const supabase = await createClient();

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
      const tokens = await createMuxTokens(playbackId, user.id);
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

export const POST = withAuth(async (request: Request) => {
  try {
    const supabase = await createClient();

    // Fetch the user *after* withAuth has passed
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      // This shouldn't happen if withAuth is working, but handle defensively
      console.error('Auth error after withAuth passed:', userError);
      return errorResponse('Unauthorized', 401);
    }

    const { playbackId } = await request.json();

    if (!playbackId) {
      console.error('Missing playback ID in request');
      return errorResponse('Missing playback ID', 400);
    }

    log(`Generating tokens for playback ID: ${playbackId}`);

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
      const tokens = await createMuxTokens(playbackId, user.id);
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