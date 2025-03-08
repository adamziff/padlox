import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createMuxPlaybackJWT } from '@/utils/mux';

// Helper for controlled logging
function log(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[TokenAPI] ${message}`, ...args);
  }
}

// Create a service client to bypass RLS when needed
function getServiceClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return null;
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

export async function GET(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.error('Authentication error:', error);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get the playback ID from the request
    const { searchParams } = new URL(request.url);
    const playbackId = searchParams.get('playbackId');

    if (!playbackId) {
      console.error('Missing playback ID in request');
      return NextResponse.json({ message: 'Missing playback ID' }, { status: 400 });
    }

    log(`Generating tokens for playback ID: ${playbackId}`);

    // Try to access with user session first
    let { data: assets, error: queryError } = await supabase
      .from('assets')
      .select('id, mux_playback_id')
      .eq('mux_playback_id', playbackId)
      .eq('user_id', user.id)
      .limit(1);

    // If user can't find the asset, try with service role as a fallback
    if ((queryError || !assets || assets.length === 0) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      log('User-level lookup failed, trying service role');
      const serviceClient = getServiceClient();
      
      if (serviceClient) {
        const serviceResult = await serviceClient
          .from('assets')
          .select('id, mux_playback_id, user_id')
          .eq('mux_playback_id', playbackId)
          .limit(1);
          
        if (!serviceResult.error && serviceResult.data?.length > 0) {
          const assetUserId = serviceResult.data[0].user_id;
          
          // Double-check this is the user's asset
          if (assetUserId === user.id) {
            log('Asset found via service role');
            assets = serviceResult.data;
            queryError = null;
          } else {
            console.error('Asset belongs to different user');
          }
        }
      }
    }

    if (queryError) {
      console.error('Database error:', queryError);
      return NextResponse.json({ message: 'Database error' }, { status: 500 });
    }

    if (!assets || assets.length === 0) {
      console.error('Access denied or video not found');
      return NextResponse.json({ message: 'Video not found or access denied' }, { status: 404 });
    }

    log('Asset found, generating tokens');

    // Generate tokens for all required purposes
    try {
      const tokens = await createTokensForPlayback(playbackId, user.id);
      log('Tokens generated successfully');

      // Return all tokens to the client
      return NextResponse.json({ 
        token: tokens.playback,  // For backward compatibility
        tokens: tokens,
        playbackId: playbackId
      });
    } catch (tokenError) {
      console.error('Failed to generate tokens:', tokenError);
      return NextResponse.json({ 
        message: 'Token generation failed',
        details: tokenError instanceof Error ? tokenError.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json({ 
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 