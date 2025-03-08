import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createMuxPlaybackJWT } from '@/utils/mux';

export async function GET(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.error('Authentication error:', error);
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the playback ID from the request
    const { searchParams } = new URL(request.url);
    const playbackId = searchParams.get('playbackId');

    if (!playbackId) {
      console.error('Missing playback ID in request');
      return new NextResponse('Missing playback ID', { status: 400 });
    }

    console.log(`Generating JWT token for playback ID: ${playbackId}, user: ${user.id}`);

    // Check if the user has access to the requested video
    const { data: assets, error: queryError } = await supabase
      .from('assets')
      .select('id')
      .eq('mux_playback_id', playbackId)
      .eq('user_id', user.id)
      .limit(1);

    if (queryError) {
      console.error('Database error:', queryError);
      return new NextResponse('Database error', { status: 500 });
    }

    if (!assets || assets.length === 0) {
      console.error('Access denied or video not found:', { playbackId, userId: user.id });
      return new NextResponse('Video not found or access denied', { status: 404 });
    }

    // Generate a JWT token for the playback ID
    const token = await createMuxPlaybackJWT(playbackId, user.id);
    console.log('JWT token generated successfully');

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
} 