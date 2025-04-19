/**
 * Mux video integration utilities
 * 
 * This module provides a comprehensive set of utilities for integrating with Mux video services,
 * including JWT token generation, upload creation, webhook verification, and asset management.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { MuxAsset, MuxWebhookEvent } from '@/types/mux';

/**
 * Helper for controlled logging
 * Only logs when MUX_LOG_LEVEL environment variable is set to 'debug'
 */
function log(message: string, ...args: unknown[]) {
  // Check for NEXT_PUBLIC_ prefix for browser environment access
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_MUX_LOG_LEVEL === 'debug') {
    console.log(`[Mux] ${message}`, ...args);
  }
}

/**
 * Creates a signed JWT for playback using RSA signing keys
 * @param playbackId - The Mux playback ID
 * @param userId - The user ID for the token
 * @param audience - The token audience ('v' for video, 't' for thumbnails, 's' for storyboards)
 * @returns The signed JWT token
 */
export async function createMuxPlaybackJWT(
  playbackId: string, 
  userId: string, 
  audience: 'v' | 't' | 's' = 'v',
  time?: number
): Promise<string> {
  // Check if we have the signing keys
  if (!process.env.MUX_SIGNING_KEY_ID || !process.env.MUX_SIGNING_PRIVATE_KEY) {
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
    const payload = {
      sub: playbackId,     // The playback ID
      aud: audience,       // 'v' = video playback, 't' = thumbnails, 's' = storyboards
      exp: Math.floor(Date.now() / 1000) + 7200, // 2 hour expiry
      kid: process.env.MUX_SIGNING_KEY_ID,
      time: time ?? 0,
      customer_id: userId  // Optional custom field
    };

    log(`Creating ${audience} JWT for playback ID: ${playbackId}`);

    // Sign the JWT with RS256 algorithm - Mux requires this for signing keys
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  } catch (error) {
    console.error('Error signing JWT token:', error);
    throw new Error(`Failed to generate video token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a Mux direct upload URL using the REST API
 * @param correlationId - Optional correlation ID for tracking
 * @returns Upload URL and asset information
 */
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
    
    // Create direct upload using the Mux REST API with minimal configuration
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
          static_renditions : [ 
            {
              "resolution" : "audio-only"
            }
          ],
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
      throw new Error(`Mux API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    log('Mux upload created successfully');
    
    // The upload response has a different structure than the asset response
    const uploadData = data.data;
    
    // Get the upload ID which will be used as the asset ID for now
    // The actual asset ID will be available through the webhook later
    const uploadId = uploadData.id;
    
    // Return the upload data with the correlation ID
    return {
      uploadUrl: uploadData.url,
      assetId: uploadId,
      playbackId: '', // We don't have a playback ID yet
      correlationId: uploadCorrelationId
    };
  } catch (error) {
    console.error('Error creating Mux upload:', error);
    throw new Error(`Failed to create Mux upload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verifies a Mux webhook signature
 * @param payload - The webhook payload as a string
 * @param signature - The signature from the Mux-Signature header
 * @param secret - The webhook signing secret
 * @returns Whether the signature is valid
 */
export function verifyMuxWebhook(
  payload: string, 
  signature: string,
  secret: string
): boolean {
  try {
    // Extract timestamp and signature from the header
    const signatureParts = signature.split(',');
    if (signatureParts.length !== 2) {
      return false;
    }

    // Extract timestamp and v1 signature
    const timestampPart = signatureParts[0];
    const signaturePart = signatureParts[1];

    if (!timestampPart.startsWith('t=') || !signaturePart.startsWith('v1=')) {
      return false;
    }

    // According to Mux docs:
    // 1. Extract timestamp and v1 value
    const timestamp = timestampPart.substring(2);
    const receivedSignature = signaturePart.substring(3);

    // 2. Create the signed payload string (timestamp.payload) 
    const signedPayload = `${timestamp}.${payload}`;

    // 3. Calculate expected signature using HMAC with SHA-256
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const expectedSignature = hmac.digest('hex');

    // 4. Compare the signatures with timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedSignature, 'hex')
      );
    } catch (e) {
      // Fallback to direct comparison if timing-safe fails
      console.error('Error during Mux webhook signature verification:', e);
      return expectedSignature === receivedSignature;
    }
  } catch (error) {
    console.error('Error during Mux webhook signature verification:', error);
    return false;
  }
}

/**
 * Gets details about a Mux asset
 * @param assetId - The Mux asset ID
 * @returns The asset details
 */
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
    throw new Error(`Failed to get Mux asset details: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates tokens for all Mux playback purposes
 * @param playbackId - The Mux playback ID
 * @param userId - The user ID for the tokens
 * @returns Object containing tokens for video, thumbnails, and storyboards
 */
export async function createMuxTokens(playbackId: string, userId: string, time?: number) {
  // Create playback token (audience = 'v')
  const playbackToken = await createMuxPlaybackJWT(playbackId, userId, 'v');
  
  // Create thumbnail token (audience = 't')
  const thumbnailToken = await createMuxPlaybackJWT(playbackId, userId, 't', time);
  
  // Create storyboard token (audience = 's')
  const storyboardToken = await createMuxPlaybackJWT(playbackId, userId, 's');
  
  // Return all three tokens
  return {
    playback: playbackToken,
    thumbnail: thumbnailToken,
    storyboard: storyboardToken
  };
}

/**
 * Process a Mux webhook event
 * @param event - The webhook event
 * @param updateAsset - Function to update the asset in the database
 * @returns Whether the event was processed successfully
 */
export async function processMuxWebhookEvent(
  event: MuxWebhookEvent,
  updateAsset: (assetId: string, data: Record<string, unknown>) => Promise<void>
): Promise<boolean> {
  // Only process video.asset.ready events
  if (event.type !== 'video.asset.ready') return false;
  
  // Get the playback ID
  const playbackId = event.data.playback_ids?.[0]?.id;
  if (!playbackId) return false;
  
  // Get the asset ID
  const assetId = event.data.id;
  if (!assetId) return false;
  
  // Update the asset
  try {
    const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    
    await updateAsset(assetId, {
      mux_processing_status: 'ready',
      mux_playback_id: playbackId,
      mux_max_resolution: event.data.max_stored_resolution,
      mux_aspect_ratio: event.data.aspect_ratio,
      mux_duration: event.data.duration,
      media_url: streamUrl,
      mux_asset_id: assetId,
      last_updated: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Error processing Mux webhook event:', error);
    return false;
  }
}

/**
 * Delete a Mux asset
 * @param assetId - The Mux asset ID to delete
 * @returns Whether the deletion was successful
 */
export async function deleteMuxAsset(assetId: string): Promise<boolean> {
  try {
    // Create Basic Auth credentials
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
    
    log(`Deleting Mux asset: ${assetId}`);
    
    // Delete asset using the Mux REST API
    const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details available');
      throw new Error(`Mux API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    log(`Successfully deleted Mux asset: ${assetId}`);
    return true;
  } catch (error) {
    console.error('Error deleting Mux asset:', error);
    return false;
  }
}

/**
 * Generate a signed URL for a static rendition
 * @param assetId - The Mux asset ID
 * @param renditionId - The rendition ID (not used in the direct streaming URL)
 * @param renditionName - The filename (e.g., 'audio.m4a')
 * @returns The signed URL for the static rendition
 */
export async function getStaticRenditionDownloadUrl(
  assetId: string,
  renditionId: string, 
  renditionName: string = 'audio.m4a'
): Promise<string> {
  try {
    // Create Basic Auth credentials for Mux API
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
    
    log(`Getting playback ID for asset ${assetId} to construct static rendition URL`);
    
    // First, we need to get the asset details to get the playback ID
    const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details available');
      throw new Error(`Mux API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !data.data.playback_ids || data.data.playback_ids.length === 0) {
      throw new Error('No playback ID found for asset');
    }
    
    // Get the first playback ID
    const playbackId = data.data.playback_ids[0].id;
    
    if (!playbackId) {
      throw new Error('No playback ID found in asset data');
    }
    
    // Instead of just returning the static rendition URL, we need to sign it with JWT
    // Get the signed JWT token for the playback ID
    const token = await createMuxPlaybackJWT(playbackId, 'system', 'v');
    
    // Construct the signed static rendition URL with the token
    const signedStaticRenditionUrl = `https://stream.mux.com/${playbackId}/${renditionName}?token=${token}`;
    
    log(`Successfully constructed signed static rendition URL: ${signedStaticRenditionUrl}`);
    return signedStaticRenditionUrl;
  } catch (error) {
    console.error('Error getting static rendition URL:', error);
    throw new Error(`Failed to get static rendition URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate a Mux thumbnail URL for a specific timestamp.
 * Uses .webp format.
 * Includes optional token for signed URLs.
 */
export function getMuxThumbnailUrl(
  playbackId: string, 
  token?: string | null // Add optional token parameter
): string {
  if (!playbackId) return ''; // Return empty if no playbackId
  
  // Base URL without the time parameter
  const baseUrl = `https://image.mux.com/${playbackId}/thumbnail.webp`;
  
  // Append token ONLY if provided
  if (token) {
    const finalUrl = `${baseUrl}?token=${token}`;
    return finalUrl;
  }
  
  // Log URL even if no token (for public assets or debugging)
  return baseUrl; // Or potentially throw an error if token is missing for signed playback?
}
