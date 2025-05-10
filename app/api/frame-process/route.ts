/**
 * API route for processing frames from SQS queue.
 * This endpoint is called by AWS SQS as a webhook when new frames are available.
 */

import { NextRequest } from 'next/server';
import { processFrame } from '@/utils/frame-processor';

// Set to dynamic to ensure the route is not statically optimized
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Parse incoming SQS message(s)
    const body = await req.json();
    
    // SQS sends an array of records
    const records = body.Records || [];
    console.log(`Received ${records.length} frames to process`);
    
    // Process each frame in parallel
    const processPromises = records.map(async (record: any) => {
      // Parse the message body (which contains our frame data)
      const messageBody = JSON.parse(record.body);
      
      // Transform SQS message to our job format
      const job = {
        asset_id: messageBody.session_id, // Using session_id as asset_id for now
        frame_url: messageBody.frame_url,
        captured_at: messageBody.captured_at || new Date().toISOString()
      };
      
      // Process the frame
      await processFrame(job);
    });
    
    // Wait for all processing to complete
    await Promise.all(processPromises);
    
    return Response.json({ success: true, processed: records.length });
  } catch (error) {
    console.error('Error processing frames:', error);
    return Response.json(
      { error: 'Failed to process frames', message: (error as Error).message },
      { status: 500 }
    );
  }
} 