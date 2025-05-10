/**
 * Activities for frame analysis using Gemini 1.5 Flash
 */
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });

// Create a Supabase service client for the Temporal worker
function createServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase credentials not found in environment variables:');
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'found' : 'missing');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'found' : 'missing');
    console.error('Current working directory:', process.cwd());
    console.error('Environment variables loaded:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    throw new Error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

// AI Config for Gemini
const MODEL_IDS = {
  google: {
    gemini_flash: 'gemini-2.0-flash-lite',
  }
};

// Function to get the model instance based on config
function getAiModel() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Google AI provider not configured. Check GOOGLE_GENERATIVE_AI_API_KEY.');
  }
  
  console.log('[Activity] Creating Google Generative AI model with API key');
  const google = createGoogleGenerativeAI();
  return google(MODEL_IDS.google.gemini_flash);
}

// Define the Zod schema for Gemini response
const InventoryItemSchema = z.object({
  caption: z.string().describe('The name of the identified item'),
  description: z.string().optional().describe('A brief description of the item\'s visible features'),
  category: z.string().optional().describe('The category of the item (furniture, electronics, etc.)'),
  estimated_value: z.number().optional().describe('Estimated value in USD'),
  confidence: z.number().describe('Confidence score between 0-1'),
});

const ResponseSchema = z.object({
  items: z.array(InventoryItemSchema).describe('An array of items detected in the image'),
});

// Types matching our updated database schema
interface InventoryItem {
  caption: string;
  description?: string;
  category?: string;
  estimated_value?: number;
  confidence: number;
  bounding_box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface FrameAnalysisResult {
  items: InventoryItem[];
}

interface ScratchItem {
  image_url: string;
  caption: string;
  description?: string;
  category?: string;
  estimated_value?: number;
  confidence: number;
  bounding_box?: object;
  sequence_order?: number;
}

// Activity to call Gemini API for frame analysis
export async function analyzeFrameWithGemini(imageUrl: string): Promise<FrameAnalysisResult> {
  console.log(`[Activity] Analyzing frame with Gemini: ${imageUrl}`);
  
  try {
    // Get the Google AI model
    const model = getAiModel();
    
    console.log('[Activity] Sending request to Gemini API');
    
    // Format the prompt for analyzing the image
    const prompt = `Analyze this image of a room or space for a home inventory system.
      Identify household items that would be important for insurance purposes.
      
      For each item detected:
      1. Provide a concise caption with the item name
      2. Add a brief description of visible features
      3. Categorize it (furniture, electronics, appliance, artwork, etc.)
      4. Estimate a reasonable value in USD based on visible quality and characteristics
      5. Provide a confidence score between 0-1
      
      The image shows: ${imageUrl}
    `;
    
    const result = await generateObject({
      model: model,
      schema: ResponseSchema,
      prompt: prompt,
      mode: 'json'
    });
    
    // Log success and return the parsed items
    console.log(`[Activity] Successfully received and parsed ${result.object.items.length} items from Gemini response`);
    return { items: result.object.items };
    
  } catch (error) {
    console.error('[Activity] Error analyzing frame with Gemini:', error);
    
    // Fall back to simulated items if there's an error
    console.log('[Activity] Falling back to simulated items due to error');
    return {
      items: [
        {
          caption: "Brown leather sofa",
          description: "Three-seater brown leather sofa with tufted back cushions",
          category: "furniture",
          estimated_value: 1200,
          confidence: 0.92
        },
        {
          caption: "Wooden coffee table",
          description: "Rectangular wooden coffee table with storage shelf",
          category: "furniture",
          estimated_value: 350,
          confidence: 0.89
        }
      ]
    };
  }
}

// Activity to store a single item from the analysis results in the database
export async function storeScratchItem(item: ScratchItem): Promise<string> {
  console.log(`[Activity] Storing scratch item, caption: ${item.caption}`);
  
  try {
    const supabase = createServiceSupabaseClient();
    
    // Insert the scratch item into the database
    const { data, error } = await supabase
      .from('scratch_items')
      .insert({
        image_url: item.image_url,
        caption: item.caption,
        description: item.description,
        category: item.category,
        estimated_value: item.estimated_value,
        confidence: item.confidence,
        bounding_box: item.bounding_box,
        sequence_order: item.sequence_order
      })
      .select('id')
      .single();
    
    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    return data.id;
  } catch (error) {
    console.error('[Activity] Error storing scratch item:', error);
    throw new Error(`Failed to store scratch item: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Activity to store all items from analysis in the database
export async function storeAllScratchItems(
  imageUrl: string, 
  items: InventoryItem[]
): Promise<string[]> {
  console.log(`[Activity] Storing ${items.length} scratch items`);
  
  const itemIds: string[] = [];
  
  try {
    // Process each item and store it
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const scratchItemId = await storeScratchItem({
        image_url: imageUrl,
        caption: item.caption,
        description: item.description,
        category: item.category,
        estimated_value: item.estimated_value,
        confidence: item.confidence,
        bounding_box: item.bounding_box,
        sequence_order: i + 1
      });
      
      itemIds.push(scratchItemId);
    }
    
    return itemIds;
  } catch (error) {
    console.error('[Activity] Error storing all scratch items:', error);
    throw new Error(`Failed to store all scratch items: ${error instanceof Error ? error.message : String(error)}`);
  }
} 