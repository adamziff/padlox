/**
 * API route for receiving and processing frames during recording.
 * The route:
 * 1. Receives frames as form data via HTTP POST
 * 2. Processes frame directly with Gemini
 * 3. Stores results in Supabase
 */

import { NextRequest } from 'next/server';
import { processFrame } from '@/utils/frame-processor';

// Configure dynamic response for Vercel serverless function
export const dynamic = 'force-dynamic';

/**
 * POST endpoint for receiving frames
 */
export async function POST(req: NextRequest) {
  console.log('📸 [API] Frame endpoint called');
  
  // Extract parameters from request
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session');
  const userId = searchParams.get('user_id');
  const muxAssetId = searchParams.get('mux_asset_id');
  
  console.log(`📸 [API] Session ID: ${sessionId}`);
  
  if (!sessionId) {
    console.error('📸 [API] Missing session ID');
    return Response.json({ error: 'Missing session ID' }, { status: 400 });
  }
  
  try {
    // Get form data from request
    const formData = await req.formData();
    const frameFile = formData.get('frame') as File;
    
    // Get timestamp from form data (fallback to 0 if not provided)
    const timestampStr = formData.get('timestamp') as string | null;
    const videoTimestamp = timestampStr ? parseFloat(timestampStr) : 0;
    
    console.log(`📸 [API] Received frame: ${frameFile.name}, size: ${Math.round(frameFile.size/1024)}KB, session: ${sessionId}, timestamp: ${videoTimestamp.toFixed(2)}s`);
    console.log(`📸 [API] User ID: ${userId || 'not provided'}, MUX Asset ID: ${muxAssetId || 'not provided'}`);
    
    if (!frameFile) {
      console.error('📸 [API] No frame provided');
      return Response.json({ error: 'No frame provided' }, { status: 400 });
    }
    
    // Convert frame to ArrayBuffer
    const frameData = await frameFile.arrayBuffer();
    
    // Process the frame directly
    console.log('📸 [API] Processing frame with Gemini vision API...');
    const result = await processFrame({
      session_id: sessionId,
      frame_data: frameData,
      video_timestamp: videoTimestamp,
      user_id: userId || undefined,
      mux_asset_id: muxAssetId || undefined
    });
    
    console.log(`📸 [API] Frame processing completed. Items found: ${result?.itemsFound || 0}, timestamp: ${videoTimestamp.toFixed(2)}s`);
    return Response.json({ 
      success: true, 
      itemsFound: result?.itemsFound || 0,
      message: `Frame processed successfully for session ${sessionId} at ${videoTimestamp.toFixed(2)}s`
    });
  } catch (error) {
    console.error('📸 [API] Error processing frame:', error);
    return Response.json(
      { error: 'Failed to process frame', message: (error as Error).message },
      { status: 500 }
    );
  }
} 