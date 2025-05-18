import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { z } from 'zod';
import { generateObject } from 'ai';
import { corsHeaders, corsJsonResponse, corsErrorResponse, corsOptionsResponse } from '@/lib/api/response';
import { getAiModel } from '@/lib/ai/config';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[Merge API] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[Merge API] ${message}`, ...args)
};

// Define schema for expected output from Gemini
const ItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  timestamp: z.number().optional(),
});

const OutputSchema = z.object({
  items: z.array(ItemSchema),
});

// Helper to handle errors consistently
const handleError = (error: any, status = 500) => {
  logger.error('Error processing merge request:', error);
  return corsErrorResponse(
    error.message || 'Failed to merge transcript with scratch items',
    status
  );
};

// Support CORS preflight requests
export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(req: NextRequest) {
  console.log(`[Merge API] POST handler started at ${new Date().toISOString()}`);
  console.log(`[Merge API] Request URL: ${req.url}`);
  console.log(`[Merge API] Request headers: ${JSON.stringify(Object.fromEntries(req.headers))}`);
  
  try {
    // Log the incoming request
    console.log(`[Merge API] POST request received at ${new Date().toISOString()}`);
    
    // Parse the request body
    const body = await req.json();
    const { user_id, asset_id, mux_asset_id, transcript } = body;

    console.log(`[Merge API] Request params: user_id=${user_id}, asset_id=${asset_id}, mux_asset_id=${mux_asset_id}, transcript length=${transcript?.length || 0}`);

    if (!user_id || !transcript || !(asset_id || mux_asset_id)) {
      return handleError(
        new Error('Missing required fields: user_id, transcript, and either asset_id or mux_asset_id'),
        400
      );
    }

    // Create a Supabase client
    const serviceClient = createServiceSupabaseClient();

    // Fetch the asset to ensure it exists and belongs to the user
    let assetQuery = serviceClient.from('assets').select('*');
    
    // Try to find by asset_id or mux_asset_id
    if (asset_id) {
      assetQuery = assetQuery.eq('id', asset_id);
    } else if (mux_asset_id) {
      logger.info(`Searching for asset by mux_asset_id: ${mux_asset_id}`);
      assetQuery = assetQuery.eq('mux_asset_id', mux_asset_id);
    }
    
    // Add user_id check to all queries
    assetQuery = assetQuery.eq('user_id', user_id);
    
    // Try to get a single matching asset
    const { data: asset, error: assetError } = await assetQuery.single();

    if (assetError || !asset) {
      return handleError(
        new Error(`Asset not found or does not belong to user: ${assetError?.message}`),
        404
      );
    }

    // Fetch scratch items for this asset
    const { data: scratchItems, error: scratchError } = await serviceClient
      .from('scratch_items')
      .select('*')
      .eq('user_id', user_id)
      .eq('mux_asset_id', asset.mux_asset_id);

    if (scratchError) {
      logger.error('Error fetching scratch items:', scratchError);
      // Continue with the process even if scratch items fetch fails
    }

    // Log detailed info about scratch items found
    logger.info(`Raw scratch item data: ${JSON.stringify(scratchItems || [])}`);
    
    // Format scratch items for inclusion in the prompt
    const formattedScratchItems = (scratchItems || []).map(item => {
      logger.info(`Processing scratch item: ${JSON.stringify(item)}`);
      return {
        name: item.name,
        description: item.description || '',
        timestamp: item.video_timestamp || 0,
        bounding_box: item.bounding_box || null
      };
    });

    logger.info(`Found ${formattedScratchItems.length} scratch items to merge with transcript`);

    // Create a prompt that includes both transcript and scratch items
    const prompt = `
You are an insurance inspection assistant analyzing a video and transcript from a home inspection.

I have a transcript from a home inspection video and a list of items that were detected in the video frames during recording.

Here is the transcript:
---
${transcript}
---

Here are the items detected in the video frames (name, description, timestamp in seconds):
${formattedScratchItems.length > 0 
  ? formattedScratchItems.map(item => 
      `- ${item.name}${item.description ? `: ${item.description}` : ''}${item.timestamp ? ` (at ${item.timestamp.toFixed(1)}s)` : ''}`
    ).join('\n')
  : 'No items were detected in the video frames.'
}

Please analyze both the transcript and the detected items to create a comprehensive list of all items mentioned in the inspection. 
Merge similar items, remove duplicates, and enhance descriptions where possible by combining information from both sources.

For each item:
1. Provide a clear name 
2. Give a detailed description that includes information from both the transcript and visual detection
3. Include timestamp information when available

Return the result as a JSON array of objects with the following format:
{
  "items": [
    {
      "name": "Item name",
      "description": "Detailed description",
      "timestamp": 123.4
    }
  ]
}

If the timestamp is unknown, you can omit it from the object.
`;

    // Generate items using Gemini API
    logger.info('Sending merged prompt to Gemini API');
    const model = getAiModel();
    
    try {
      const result = await generateObject({
        model: model,
        schema: OutputSchema,
        prompt,
        mode: 'json'
      });
      
      const analyzedItems = result.object.items || [];
      logger.info(`Generated ${analyzedItems.length} items from Gemini API`);
      
      // Create new asset items instead of updating an 'items' column
      if (analyzedItems.length > 0) {
        // Create array of new items to insert
        const itemsToInsert = analyzedItems.map(item => ({
          user_id: user_id,
          name: item.name || 'Unnamed Item',
          description: item.description || '',
          media_type: 'item',
          media_url: '',
          is_source_video: false,
          source_video_id: asset.id,
          item_timestamp: item.timestamp || null,
          mux_playback_id: asset.mux_playback_id,
          mux_asset_id: asset.mux_asset_id,
          estimated_value: null // No value in scratch items yet
        }));
        
        // Insert new items as rows in the assets table
        const { data: insertedItems, error: insertError } = await serviceClient
          .from('assets')
          .insert(itemsToInsert)
          .select('id, name');
  
        if (insertError) {
          return handleError(
            new Error(`Failed to insert merged items: ${insertError.message}`),
            500
          );
        }
        
        logger.info(`Successfully inserted ${insertedItems?.length || 0} items from merge`);
      }
      
      // Just update the asset as processed, without trying to store items in a column
      const { error: updateError } = await serviceClient
        .from('assets')
        .update({
          is_processed: true,
          last_updated: new Date().toISOString()
        })
        .eq('id', asset.id);

      if (updateError) {
        return handleError(
          new Error(`Failed to update asset processed status: ${updateError.message}`),
          500
        );
      }
  
      // Optionally, delete the scratch items now that they've been merged
      if (formattedScratchItems.length > 0) {
        const { error: deleteError } = await serviceClient
          .from('scratch_items')
          .delete()
          .eq('user_id', user_id)
          .eq('mux_asset_id', asset.mux_asset_id);
   
        if (deleteError) {
          logger.error('Error deleting scratch items after merge:', deleteError);
          // Continue even if deletion fails
        } else {
          logger.info(`Successfully deleted ${formattedScratchItems.length} scratch items after merge`);
        }
      }
  
      // Return success response
      return corsJsonResponse({
        success: true,
        items: analyzedItems,
        message: 'Successfully merged transcript with scratch items',
      });
    } catch (error: any) {
      return handleError(error);
    }
  } catch (error: any) {
    return handleError(error);
  }
} 