/**
 * Mux video integration utilities
 * 
 * This module provides a comprehensive set of utilities for integrating with Mux video services,
 * including JWT token generation, upload creation, webhook verification, and asset management.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { MuxAsset, MuxWebhookEvent } from '@/types/mux';
import { transcribeAudioUrl, extractPlainText } from '@/lib/deepgram';
import { processTranscriptAndSaveItems } from '@/lib/ai/inventory';
import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { Database } from '@/lib/db/schema';

/**
 * Helper for controlled logging
 * Only logs when MUX_LOG_LEVEL environment variable is set to 'debug'
 */
function log(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'development' && process.env.MUX_LOG_LEVEL === 'debug') {
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
  audience: 'v' | 't' | 's' = 'v'
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
export async function createMuxTokens(playbackId: string, userId: string) {
  // Create playback token (audience = 'v')
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
}

/**
 * Process a Mux webhook event
 * @param event - The webhook event
 * @returns Whether the event was processed successfully
 */
export async function processMuxWebhookEvent(
  event: MuxWebhookEvent
): Promise<boolean> {
  log(`Processing Mux event: ${event.type}`);
  const muxAssetId = event.data?.id || event.data?.asset_id;
  const supabaseAdmin = createServiceSupabaseClient();

  if (!muxAssetId) {
    console.error('[Mux Webhook] Event missing Mux Asset ID:', event);
    return false;
  }

  try {
    // --- Handle Asset Ready (Example) ---
    if (event.type === 'video.asset.ready') {
      console.log(`[Mux Webhook] Asset ready: ${muxAssetId}`);
      const assetDetails = await getMuxAssetDetails(muxAssetId); // Fetch full details if needed

      // Update our DB record with playback IDs, duration etc.
      await supabaseAdmin.from('assets').update({
          mux_playback_id: assetDetails.playback_ids?.[0]?.id,
          mux_duration: assetDetails.duration,
          mux_aspect_ratio: assetDetails.aspect_ratio,
          mux_max_resolution: assetDetails.max_stored_resolution,
          mux_processing_status: 'ready',
          // Add other relevant fields from assetDetails
      }).eq('mux_asset_id', muxAssetId);

      log(`[Mux Webhook] Updated asset ${muxAssetId} in DB with ready status.`);
      return true;
    }

    // --- Handle Static Rendition Ready (Audio for Transcription) ---
    if (event.type === 'video.asset.static_renditions.ready') {
      console.log(`[Mux Webhook] Static renditions ready for asset: ${muxAssetId}`);

      // Correctly access static_renditions from event data using the updated type
      const renditionInfo = event.data?.static_renditions?.files?.find((f:any) => f.name === 'audio.m4a'); 

      if (!renditionInfo) {
          console.warn(`[Mux Webhook] Could not find audio.m4a rendition info in static_renditions.ready event for ${muxAssetId}.`);
          // Consider fetching asset details as fallback if needed
          // const assetDetails = await getMuxAssetDetails(muxAssetId);
          // renditionInfo = assetDetails.static_renditions?.files?.find(...) // Example
          return false; // Or handle differently
      }

      // Check if transcription already attempted/completed for this asset (use supabaseAdmin)
      const { data: existingAsset, error: fetchError } = await supabaseAdmin
          .from('assets')
          .select('id, user_id, transcript_processing_status, processing_status')
          .eq('mux_asset_id', muxAssetId)
          .maybeSingle(); 

      if (fetchError) {
          console.error(`[Mux Webhook] Error fetching existing asset for mux_asset_id ${muxAssetId}:`, fetchError);
          return false;
      }
      if (!existingAsset) {
          console.error(`[Mux Webhook] No asset found in DB for mux_asset_id ${muxAssetId}. Cannot process transcript.`);
          return false; // Critical error, asset should exist
      }

      // Avoid reprocessing if already done or in progress
      if (existingAsset.transcript_processing_status === 'completed' || existingAsset.transcript_processing_status === 'processing' || existingAsset.processing_status === 'completed' || existingAsset.processing_status === 'failed') {
           console.log(`[Mux Webhook] Asset ${existingAsset.id} transcript already processed or processing. Status: ${existingAsset.transcript_processing_status}, ${existingAsset.processing_status}. Skipping.`);
           return true; // Already handled
      }

      // Update status to 'processing' immediately (use supabaseAdmin)
      await supabaseAdmin.from('assets').update({
          transcript_processing_status: 'processing'
      }).eq('id', existingAsset.id);


      try {
          // 1. Get Download URL for the audio rendition
          console.log(`[Mux Webhook] Getting audio download URL for asset ${muxAssetId}`);
          const audioUrl = await getStaticRenditionDownloadUrl(muxAssetId, 'static_renditions', renditionInfo.name);

          // 2. Transcribe using Deepgram
          console.log(`[Mux Webhook] Starting transcription for asset ${existingAsset.id}`);
          const transcriptData = await transcribeAudioUrl(audioUrl);
          const plainText = extractPlainText(transcriptData);

          // 3. Update Asset with Transcript (use supabaseAdmin)
          console.log(`[Mux Webhook] Transcription complete for asset ${existingAsset.id}. Saving transcript.`);
          await supabaseAdmin.from('assets').update({
              transcript: transcriptData as any, // Store full JSON
              transcript_text: plainText,
              transcript_processing_status: 'completed',
              transcript_error: null,
          }).eq('id', existingAsset.id);

          // 4. Trigger LLM Processing (fire and forget, or await if necessary)
          console.log(`[Mux Webhook] Triggering AI item extraction for asset ${existingAsset.id}`);
          // We don't await this - let it run in the background
          processTranscriptAndSaveItems(existingAsset.id, plainText, existingAsset.user_id)
            .catch(err => {
                console.error(`[Mux Webhook] Background AI processing failed for asset ${existingAsset.id}:`, err);
                // Error is logged within processTranscriptAndSaveItems, status set there
            });

      } catch (transcriptionError) {
           console.error(`[Mux Webhook] Error during transcription/processing for asset ${existingAsset.id}:`, transcriptionError);
           // Update asset status to reflect transcription failure
           await supabaseAdmin.from('assets').update({
               transcript_processing_status: 'error',
               transcript_error: transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError),
               processing_status: 'failed' // Mark overall processing as failed too
           }).eq('id', existingAsset.id);
           return false; // Indicate failure
      }

      return true;
    }

    // --- Handle Asset Errored (Example) ---
    if (event.type === 'video.asset.errored') {
      console.error(`[Mux Webhook] Asset errored: ${muxAssetId}`, event.data);
      // Update our DB record to reflect the error
       await supabaseAdmin.from('assets').update({
          mux_processing_status: 'error',
          processing_status: 'failed',
          // Potentially store error details if schema allows
       }).eq('mux_asset_id', muxAssetId);
      return true; // Handled the event
    }

    // Add handlers for other relevant events (e.g., video.upload.asset_created) if needed

    log(`[Mux Webhook] Event type ${event.type} not explicitly handled.`);
    return true; // Acknowledge webhook even if no action taken

  } catch (error) {
    console.error(`[Mux Webhook] Error processing event type ${event.type} for asset ${muxAssetId}:`, error);
    // Potentially update asset status to indicate a general processing error
    if (muxAssetId) {
        try {
            await supabaseAdmin.from('assets').update({ processing_status: 'failed' }).eq('mux_asset_id', muxAssetId);
        } catch (dbError) {
            console.error('[Mux Webhook] Failed to update asset status after error:', dbError);
        }
    }
    return false; // Indicate failure to Mux (may cause retries)
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
  const supabaseAdmin = createServiceSupabaseClient();
  try {
    // Create Basic Auth credentials for Mux API
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
    
    log(`Getting playback ID for asset ${assetId} to construct static rendition URL`);
    
    // We need the playback ID to construct the stream URL
    // Fetch the associated user_id first to sign the token correctly, 
    // OR use a generic 'system' user if appropriate for background tasks.
    // Using 'system' for simplicity here.
    const { data: assetData, error: assetError } = await supabaseAdmin
        .from('assets')
        .select('mux_playback_id, user_id') // Fetch playback_id directly if stored
        .eq('mux_asset_id', assetId)
        .maybeSingle();

    if (assetError || !assetData) {
      throw new Error(`Failed to fetch asset data for mux_asset_id ${assetId}: ${assetError?.message}`);
    }
    
    const playbackId = assetData.mux_playback_id;
    const userId = assetData.user_id || 'system'; // Use actual user ID or 'system'

    if (!playbackId) {
       // Fallback: fetch from Mux API if not stored in DB
       log(`Playback ID not found in DB for ${assetId}, fetching from Mux API...`);
       const muxAssetDetails = await getMuxAssetDetails(assetId);
       const apiPlaybackId = muxAssetDetails?.playback_ids?.[0]?.id;
       if (!apiPlaybackId) {
           throw new Error(`No playback ID found for asset ${assetId} via API.`);
       }
       // TODO: Optionally update your DB with this playbackId here
       // await supabaseAdmin.from('assets').update({ mux_playback_id: apiPlaybackId }).eq('mux_asset_id', assetId);
       log(`Using playback ID ${apiPlaybackId} from Mux API.`);
       // Sign token and construct URL using apiPlaybackId
       const token = await createMuxPlaybackJWT(apiPlaybackId, userId, 'v');
       const signedUrl = `https://stream.mux.com/${apiPlaybackId}/${renditionName}?token=${token}`;
       log(`Successfully constructed signed static rendition URL: ${signedUrl}`);
       return signedUrl;
    }
    
    log(`Using playback ID ${playbackId} from DB.`);
    // Sign token using the playback ID found in the DB
    const token = await createMuxPlaybackJWT(playbackId, userId, 'v');
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
  timestamp: number,
  token?: string | null // Add optional token parameter
): string {
  if (!playbackId) return ''; // Return empty if no playbackId
  
  // Ensure timestamp is non-negative
  const validTimestamp = Math.max(0, timestamp);
  
  // Base URL
  const baseUrl = `https://image.mux.com/${playbackId}/thumbnail.webp?time=${validTimestamp}`;
  
  // Append token if provided
  if (token) {
    return `${baseUrl}&token=${token}`;
  }
  
  // Return base URL if no token
  return baseUrl;
}
