/**
 * WebSocket API route for receiving and processing frames during recording.
 * The route:
 * 1. Receives frames as binary data via WebSocket
 * 2. Uploads each frame to S3
 * 3. Enqueues the frame for processing with additional metadata
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

// Configure clients
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Configure constants
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'padlox-frames';
const SQS_QUEUE_URL = process.env.SQS_FRAME_QUEUE_URL || '';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * POST endpoint for receiving frames directly over HTTP
 * Used as a fallback when WebSockets aren't available
 */
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session');
  
  if (!sessionId) {
    return Response.json({ error: 'Missing session ID' }, { status: 400 });
  }
  
  // Verify session exists
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .single();
  
  if (error || !session) {
    console.error('Invalid session ID:', sessionId, error);
    return Response.json({ error: 'Invalid session ID' }, { status: 404 });
  }
  
  // Get frame data from request
  const frameData = await req.arrayBuffer();
  
  try {
    // Process the frame
    await processFrame(frameData, sessionId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error processing frame:', error);
    return Response.json({ error: 'Failed to process frame' }, { status: 500 });
  }
}

/**
 * Process a single frame
 * 1. Upload to S3
 * 2. Enqueue for processing
 */
async function processFrame(frameData: ArrayBuffer, sessionId: string) {
  // Generate a unique key for the frame
  const uuid = crypto.randomUUID();
  const key = `frames/${sessionId}/${uuid}.jpg`;
  
  // Convert ArrayBuffer to Uint8Array for S3
  const frameDataUint8 = new Uint8Array(frameData);
  
  // Upload to S3
  const s3Command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: frameDataUint8,
    ContentType: 'image/jpeg',
  });
  
  await s3Client.send(s3Command);
  
  // Get the public URL for the frame
  const frameUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
  
  // Enqueue for processing
  const sqsCommand = new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      session_id: sessionId,
      frame_url: frameUrl,
      frame_key: key,
      captured_at: new Date().toISOString(),
    }),
  });
  
  await sqsClient.send(sqsCommand);
} 