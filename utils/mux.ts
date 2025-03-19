import jwt from 'jsonwebtoken';
import { MuxAsset } from '@/types/mux';
import crypto from 'crypto';

// Helper for controlled logging
function log(message: string, ...args: unknown[]) {
  // Only log in development and when MUX_LOG_LEVEL is set
  if (process.env.NODE_ENV === 'development' && process.env.MUX_LOG_LEVEL === 'true') {
    console.log(`[Mux] ${message}`, ...args);
  }
}

// Function to create a signed JWT for playback using RSA signing keys
export async function createMuxPlaybackJWT(playbackId: string, userId: string, audience: 'v' | 't' | 's' = 'v'): Promise<string> {
  // Check if we have the signing keys
  if (!process.env.MUX_SIGNING_KEY_ID || !process.env.MUX_SIGNING_PRIVATE_KEY) {
    console.error('Missing MUX_SIGNING_KEY_ID or MUX_SIGNING_PRIVATE_KEY environment variables');
    throw new Error('Mux signing configuration error');
  }
  
  // Validate inputs to avoid common errors
  if (!playbackId) {
    throw new Error('Invalid playback ID: cannot be empty');
  }
  
  if (!userId) {
    throw new Error('Invalid user ID: cannot be empty');
  }
  
  try {
    // Decode the base64 encoded private key
    const privateKey = Buffer.from(process.env.MUX_SIGNING_PRIVATE_KEY, 'base64').toString('utf-8');
    
    // Format the JWT payload exactly as Mux expects
    // The key requirements are:
    // - sub: The playback ID
    // - aud: Video playback ('v'), thumbnails ('t'), or storyboards ('s')
    // - exp: Expiration timestamp
    // - kid: The Mux signing key ID
    const payload = {
      sub: playbackId,     // The playback ID
      aud: audience,       // 'v' = video playback, 't' = thumbnails, 's' = storyboards
      exp: Math.floor(Date.now() / 1000) + 7200, // 2 hour expiry
      kid: process.env.MUX_SIGNING_KEY_ID,
      customer_id: userId  // Optional custom field
    };

    log(`Creating ${audience} JWT for playback ID: ${playbackId}`);

    // Sign the JWT with RS256 algorithm - Mux requires this for signing keys
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    
    return token;
  } catch (error) {
    console.error('Error signing JWT token:', error);
    throw new Error(`Failed to generate video token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to create a Mux direct upload URL using the REST API directly
export async function createMuxUpload(correlationId?: string): Promise<{
  uploadUrl: string;
  assetId: string;
  playbackId: string;
  correlationId: string;
}> {
  try {
    // Create a unique correlation ID if not provided
    const uploadCorrelationId = correlationId || `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create Basic Auth credentials
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
    
    log(`Creating new Mux upload with correlation ID: ${uploadCorrelationId}`);
    
    // Create direct upload using the Mux REST API with more metadata
    const response = await fetch('https://api.mux.com/video/v1/uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cors_origin: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        new_asset_settings: {
          playback_policies: ['signed'],
          // Add metadata to help track uploads
          metadata: {
            correlation_id: uploadCorrelationId,
            created_at: new Date().toISOString(),
            app: 'padlox'
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details available');
      console.error('Mux API error details:', errorText);
      throw new Error(`Mux API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    log('Mux upload created successfully');
    
    // The upload response has a different structure than the asset response
    const uploadData = data.data;
    
    // Get the upload ID which will be used as the asset ID for now
    // The actual asset ID will be available through the webhook later
    const uploadId = uploadData.id;
    
    // We don't have a playback ID yet, but we'll update it when the asset is ready
    const playbackId = '';
    
    // Return the upload data with the correlation ID
    return {
      uploadUrl: uploadData.url,
      assetId: uploadId,
      playbackId: playbackId,
      correlationId: uploadCorrelationId
    };
  } catch (error) {
    console.error('Error creating Mux upload:', error);
    throw new Error('Failed to create Mux upload');
  }
}

// Function to verify Mux webhook signatures
export function verifyMuxWebhook(
  payload: string, 
  signature: string,
  secret: string
): boolean {
  try {
    // Extract timestamp and signature from the header
    const signatureParts = signature.split(',');
    if (signatureParts.length !== 2) {
      console.error('Invalid signature format, expected t=[timestamp],v1=[signature]');
      return false;
    }

    // Extract timestamp and v1 signature
    const timestampPart = signatureParts[0];
    const signaturePart = signatureParts[1];

    if (!timestampPart.startsWith('t=') || !signaturePart.startsWith('v1=')) {
      console.error('Invalid signature format, expected t=[timestamp],v1=[signature]');
      return false;
    }

    const timestamp = timestampPart.substring(2);
    const receivedSignature = signaturePart.substring(3);

    // Create the string to sign (timestamp.payload)
    const signedPayload = `${timestamp}.${payload}`;

    // Calculate expected signature using HMAC with SHA-256
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const expectedSignature = hmac.digest('hex');

    // Perform a timing-safe comparison of the signatures
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );
  } catch (error) {
    console.error('Invalid Mux webhook signature:', error);
    return false;
  }
}

// Function to get details about a Mux asset
export async function getMuxAssetDetails(assetId: string): Promise<MuxAsset> {
  try {
    // Create Basic Auth credentials
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
    
    log(`Fetching details for Mux asset: ${assetId}`);
    
    // Fetch asset details using the Mux REST API
    const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Mux API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.data as MuxAsset;
  } catch (error) {
    console.error('Error getting Mux asset details:', error);
    throw new Error('Failed to get Mux asset details');
  }
}