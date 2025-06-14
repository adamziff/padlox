/**
 * Worker utility for processing frames with vision models.
 * This module handles the direct processing of video frames
 * for real-time analysis during recording.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/db/schema';
import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

// Configure Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

// Configure Gemini AI model
const GOOGLE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash-lite';

interface FrameProcessingJob {
  /** Session ID for the recording */
  session_id: string;
  /** Raw frame data as ArrayBuffer */
  frame_data: ArrayBuffer;
  /** Timestamp in seconds from start of video */
  video_timestamp: number;
  /** User ID who owns this recording (optional) */
  user_id?: string;
  /** MUX asset ID for the video (optional) */
  mux_asset_id?: string;
}

interface ProcessingResult {
  itemsFound: number;
  success: boolean;
}

// Define schema for Gemini response
const InventoryItemSchema = z.object({
  name: z.string().describe('The name of the identified item'),
  description: z.string().optional().describe('A brief description of the item\'s visible features'),
  estimated_value: z.number().nullable().describe('An estimated value of the item in USD (can be null if impossible to estimate)')
});

const ResponseSchema = z.object({
  items: z.array(InventoryItemSchema).describe('An array of items detected in the image'),
});

/**
 * Process a single frame with vision model and store results
 * 
 * @param job The frame processing job with metadata
 * @returns Promise that resolves when processing is complete with result info
 */
export async function processFrame(job: FrameProcessingJob): Promise<ProcessingResult> {
  try {
    console.log(`🖼️ [Processor] Processing frame for session ${job.session_id} at timestamp ${job.video_timestamp.toFixed(2)}s`);
    
    // Convert frame data to base64 for Gemini
    const base64Image = Buffer.from(job.frame_data).toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64Image}`;
    console.log(`🖼️ [Processor] Converted image to base64, length: ${base64Image.length}`);
    
    // Verify Gemini API key is configured
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error(`🖼️ [Processor] ERROR: Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable`);
      return { itemsFound: 0, success: false };
    }
    
    // Call Gemini to analyze the frame
    console.log(`🖼️ [Processor] Calling Gemini API with model: ${GEMINI_MODEL}`);
    const analysis = await analyzeFrameWithGemini(imageUrl);
    
    console.log(`🖼️ [Processor] Gemini analysis complete, found ${analysis.items.length} items`);
    
    // Store each detected item in the database
    if (analysis.items.length > 0) {
      await storeAllItems(job.session_id, analysis.items, job.video_timestamp, job.user_id, job.mux_asset_id);
      console.log(`🖼️ [Processor] Stored ${analysis.items.length} items from frame analysis`);
      return { itemsFound: analysis.items.length, success: true };
    } else {
      console.log('🖼️ [Processor] No items detected in this frame');
      return { itemsFound: 0, success: true };
    }
  } catch (error) {
    console.error('🖼️ [Processor] Error processing frame:', error);
    return { itemsFound: 0, success: false };
  }
}

/**
 * Analyze a frame with Gemini AI
 * 
 * @param imageUrl Base64 data URL of the image
 * @returns Analysis result with detected items
 */
async function analyzeFrameWithGemini(imageUrl: string) {
  try {
    // Initialize Google AI
    console.log('🖼️ [Processor] Creating Google AI client');
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      console.error('🖼️ [Processor] Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable');
      throw new Error('Google AI API key not configured');
    }
    
    const google = createGoogleGenerativeAI();
    const model = google(GEMINI_MODEL);
    
    console.log(`🖼️ [Processor] Using Gemini model: ${GEMINI_MODEL}`);
    
    // Format the prompt for analyzing the image
    const prompt = `Analyze this image of a room or space for a home inventory system.
      Identify household items and personal belongings that would be important for insurance purposes.
      
      HOME INVENTORY FOCUS: ONLY include items valuable for insurance claims:
      INCLUDE: Electronics, furniture, appliances, art, jewelry, tools, sporting goods, musical instruments, collectibles, clothing (expensive), books (valuable collections), home decor, beds, etc.
      EXCLUDE: Food, consumables, office supplies, toiletries, cleaning products, plants, temporary items
      
      CRITICAL CONFIDENCE REQUIREMENT:
      - ONLY include items you can clearly see and identify with HIGH CONFIDENCE.
      - If the image is blurry, dark, out of focus, or unclear, DO NOT attempt to identify items.
      - If you cannot clearly distinguish what an item is, DO NOT include it.
      - DO NOT MAKE UP OR GUESS what items might be present in unclear areas.
      
      IMPORTANT EXCLUSIONS:
      - DO NOT include fixed features of the home itself (e.g., windows, doors, walls, ceilings, floors, built-in shelving).
      - DO NOT include everyday clothing or accessories being worn by people in the video (e.g., shirts, pants, shoes, etc.)
      - Only include jewelry if it is not being worn by a person and it is clearly the focus of the image.
      - DO NOT include food, snacks, drinks, or consumable items.
      - Focus ONLY on movable contents and distinct, valuable personal property.

      For each item you can CLEARLY identify with high confidence:
      1. Provide a specific and descriptive name (2-3 words minimum) that clearly distinguishes this item from similar items.
         - For example, use "Brown Leather Sofa" instead of just "Sofa".
         - For electronics, include brand if visible: "Apple MacBook Pro" instead of just "Laptop".
         - For artwork or decorative items, describe the style: "Abstract Canvas Painting" instead of just "Artwork".
         - DO NOT MAKE UP OR GUESS DETAILS. ONLY USE WHAT YOU CAN CLEARLY SEE IN THE IMAGE.
      
      2. Write a DETAILED TWO-SENTENCE description:
         - First sentence must cover physical attributes: size, color, material, distinctive features.
         - Second sentence must describe location in the room and apparent condition.
         - Example: "Large brown leather sectional sofa with chaise and decorative pillows. The sofa is positioned against the living room wall and appears to be in excellent condition with minimal wear."
      
      3. Provide an estimated value in USD as a number. IMPORTANT: You must provide a reasonable USD estimate for EVERY item (never return null).
      
      Focus on accuracy over quantity. Only include items you can see clearly and identify with certainty.
      Your descriptions must be specific enough that identical items detected in different frames can be recognized as the same item.
      Concentrate on items that would be valuable for insurance documentation and that you can identify with HIGH CONFIDENCE.
      
      The image shows:`;
    
    console.log('🖼️ [Processor] Sending request to Gemini');
    
    // Generate structured response using AI
    const result = await generateObject({
      model,
      schema: ResponseSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image", image: imageUrl }
          ]
        }
      ]
    });
    
    // Ensure result matches our schema
    console.log(`🖼️ [Processor] Received response from Gemini with ${result.object.items.length} items`);
    return { items: result.object.items };
  } catch (error) {
    console.error('🖼️ [Processor] Error calling Gemini:', error);
    // Return empty array if AI fails to prevent complete failure
    return { items: [] };
  }
}

/**
 * Store all detected items in the database
 * 
 * @param sessionId Session ID
 * @param items Detected items
 * @param videoTimestamp Timestamp in seconds
 * @param userId Optional user ID who owns this recording
 * @param muxAssetId Optional MUX asset ID of the video
 */
async function storeAllItems(
  sessionId: string,
  items: z.infer<typeof InventoryItemSchema>[],
  videoTimestamp: number,
  userId?: string,
  muxAssetId?: string
) {
  console.log(`🖼️ [Processor] Storing ${items.length} items for session ${sessionId} at timestamp ${videoTimestamp.toFixed(2)}s`);
  console.log(`🖼️ [Processor] User ID: ${userId || 'not provided'}, MUX Asset ID: ${muxAssetId || 'not provided'}`);
  console.log(`🖼️ [Processor] Supabase URL: ${supabaseUrl ? 'configured' : 'missing'}`);
  console.log(`🖼️ [Processor] Supabase Service Key: ${supabaseServiceKey ? 'configured' : 'missing'}`);
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('🖼️ [Processor] Missing Supabase configuration');
    return;
  }
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`🖼️ [Processor] Storing item #${i+1}: ${item.name}`);
    
    try {
      // Ensure videoTimestamp is never null
      const safeTimestamp = videoTimestamp !== null && videoTimestamp !== undefined 
        ? videoTimestamp 
        : 0;
        
      // Insert with the new simplified schema including user_id and mux_asset_id
      const insertData = {
        name: item.name,
        description: item.description,
        video_timestamp: safeTimestamp,
        user_id: userId || null,
        mux_asset_id: muxAssetId || null,
        estimated_value: item.estimated_value
      };
      
      console.log(`🖼️ [Processor] Inserting item data: ${JSON.stringify({
        name: item.name,
        description: item.description ? item.description.substring(0, 30) + '...' : null,
        video_timestamp: safeTimestamp,
        estimated_value: item.estimated_value,
        user_id: userId ? 'provided' : null,
        mux_asset_id: muxAssetId ? muxAssetId.substring(0, 10) + '...' : null
      })}`);
      
      const { data, error } = await supabase.from('scratch_items').insert(insertData);
      
      if (error) {
        console.error(`🖼️ [Processor] Database error storing item #${i+1}:`, error);
      } else {
        console.log(`🖼️ [Processor] Successfully stored item #${i+1}`);
      }
    } catch (error) {
      console.error(`🖼️ [Processor] Exception storing item #${i+1}:`, error);
    }
  }
} 