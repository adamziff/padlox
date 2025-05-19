import { NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { z } from 'zod';
import { generateObject } from 'ai';
import { corsJsonResponse, corsErrorResponse, corsOptionsResponse } from '@/lib/api/response';
import { getAiModel } from '@/lib/ai/config';

const logger = {
  info: (message: string, ...args: unknown[]) => console.log(`[Merge API] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[Merge API] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[Merge API] ${message}`, ...args)
};

// Define schema for expected output from Gemini
const ItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  timestamp: z.number().optional(),
  estimated_value: z.number().nullable().optional(),
});

const OutputSchema = z.object({
  items: z.array(ItemSchema),
});

// Define types for the analyzed items
interface AnalyzedItem {
  name: string;
  description?: string;
  timestamp?: number;
  estimated_value?: number | null;
  id?: string;
}

// Helper to handle errors consistently
const handleError = (error: unknown, status = 500) => {
  logger.error('Error processing merge request:', error);
  return corsErrorResponse(
    error instanceof Error ? error.message : 'Failed to merge transcript with scratch items',
    status
  );
};

// Support CORS preflight requests
export async function OPTIONS() {
  return corsOptionsResponse();
}

// Helper to format timestamps consistently to 1 decimal place
const formatTimestamp = (timestamp: number | null | undefined): number => {
  if (timestamp === null || timestamp === undefined) return 0;
  return Math.round(Number(timestamp) * 10) / 10;
};

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

    // Check for required fields - note that transcript is now optional if we have user_id and an asset ID
    if (!user_id || !(asset_id || mux_asset_id)) {
      return handleError(
        new Error('Missing required fields: user_id and either asset_id or mux_asset_id'),
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
      // Ensure timestamp is sanitized before including in prompt
      const sanitizedTimestamp = item.video_timestamp !== null && item.video_timestamp !== undefined 
        ? Math.round(Number(item.video_timestamp) * 10) / 10 
        : 0;
      
      logger.info(`Original timestamp: ${item.video_timestamp}, Sanitized: ${sanitizedTimestamp}`);
      
      return {
        name: item.name,
        description: item.description || '',
        timestamp: sanitizedTimestamp,
        estimated_value: item.estimated_value
      };
    });

    logger.info(`Found ${formattedScratchItems.length} scratch items to merge with transcript`);

    // Create a prompt that includes both transcript and scratch items
    const prompt = `
You are an insurance inspection assistant analyzing a video and transcript from a home inspection.

${transcript ? `I have a transcript from a home inspection video and a list of items that were detected in the video frames during recording.

Here is the transcript:
---
${transcript}
---` : `I have a list of items that were detected in the video frames during a home inspection recording. There is no audio transcript available.`}

Here are the items detected in the video frames (name, description, timestamp in seconds, estimated value):
${formattedScratchItems.length > 0 
  ? formattedScratchItems.map(item => 
      `- ${item.name}${item.description ? `: ${item.description}` : ''}${item.timestamp ? ` (at ${formatTimestamp(item.timestamp).toFixed(1)}s)` : ''}${item.estimated_value ? ` - Estimated Value: $${item.estimated_value}` : ''}`
    ).join('\n')
  : 'No items were detected in the video frames.'
}

Please analyze ${transcript ? 'both the transcript and' : ''} the detected items to create a comprehensive list of all items mentioned in the inspection. 
${transcript ? 'Merge similar items, remove duplicates, and enhance descriptions where possible by combining information from both sources.' : 'Provide a complete analysis of the items detected in the video frames.'}

Pay special attention to match items that might be referred to differently in the transcript versus the visual detection. For example, if the transcript mentions a "throw pillow" and the visual detection found a "pillow" or "decorative pillow", these are likely the same item and should be merged.

For each item:
1. Provide a clear name 
2. Give a detailed description that includes information from ${transcript ? 'both the transcript and' : ''} visual detection
3. Include the timestamp (in seconds) when the item first appears. For duplicate or merged items, use the EARLIEST timestamp from the source items.
4. Include an estimated value in USD - this is REQUIRED. If available from the visual or audio detection, use that, otherwise provide your best estimate. Never omit this.

Return the result as a JSON array of objects with the following format:
{
  "items": [
    {
      "name": "Item name",
      "description": "Detailed description",
      "timestamp": 2.0,
      "estimated_value": 100.00
    }
  ]
}

IMPORTANT: Format timestamps as numbers with EXACTLY one decimal place (e.g., 2.0 or 2.1), not strings or numbers with excessive decimal precision. DO NOT return timestamps with more than one decimal place. For example, use 2.0 not 2.000 or 2.00000. If the timestamp or estimated value is unknown, you can omit it from the object.

CRITICAL: Never return timestamps with many decimal places like 0.000000000 as this will break the system. Always round and limit to one decimal place.
`;

    // Generate items using Gemini API
    logger.info('Sending merged prompt to Gemini API');
    const model = getAiModel();
    
    try {
      // Attempt to generate object using Gemini
      let result;
      try {
        result = await generateObject({
          model: model,
          schema: OutputSchema,
          prompt,
          mode: 'json'
        });

        // Log the raw result from Gemini
        logger.info(`Raw Gemini response items: ${JSON.stringify(result.object.items)}`);
        
        // Specifically log estimated values from the raw response
        if (result.object.items && result.object.items.length > 0) {
          logger.info('Estimated values in raw Gemini response:');
          result.object.items.forEach((item, i) => {
            logger.info(`  Item ${i + 1}: ${item.name}, raw estimated_value: ${JSON.stringify(item.estimated_value)}, type: ${typeof item.estimated_value}`);
          });
        }
      } catch (jsonError: unknown) {
        // If JSON parsing fails, implement fallback strategy
        logger.warn('JSON parsing failed, attempting to preprocess response', jsonError);
        
        // Try to get the raw text response from the error
        const errorText = jsonError instanceof Error && 'text' in jsonError 
          ? String(jsonError.text)
          : null;
        
        if (errorText) {
          // Preprocess the response to fix timestamp format issues
          logger.info('Preprocessing malformed response to fix timestamp format');
          
          // Step 1: Fix extreme decimal places in timestamp values
          let preprocessedText = errorText.replace(
            /"timestamp"\s*:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g, 
            (match, number) => {
              // Convert to number and round to 1 decimal place
              const sanitizedNumber = Math.round(parseFloat(number) * 10) / 10;
              return `"timestamp": ${sanitizedNumber}`;
            }
          );
          
          // Step 2: Fix common JSON structural errors
          
          // Fix missing commas between array items (replace }{ with },{)
          preprocessedText = preprocessedText.replace(/}\s*\n\s*{/g, '},{');
          
          // Fix incorrect comma placement (replace }, with })
          preprocessedText = preprocessedText.replace(/},\s*\n\s*]/g, '}]');
          
          // Fix malformed array item separators (replace }  , with },)
          preprocessedText = preprocessedText.replace(/}\s*,\s*\n/g, '},\n');
          
          // Remove any trailing commas before closing braces
          preprocessedText = preprocessedText.replace(/,\s*}/g, '}');
          
          // Handle any other common JSON syntax errors we've seen
          preprocessedText = preprocessedText.replace(/}\s*\n\s*,\s*\n\s*{/g, '},\n{');
          
          // Log the preprocessed text for debugging
          logger.info('Preprocessed text length: ' + preprocessedText.length);
          logger.info('First 500 chars: ' + preprocessedText.substring(0, 500));
          logger.info('Last 500 chars: ' + preprocessedText.substring(preprocessedText.length - 500));
          
          logger.info('Attempting to parse preprocessed response');
          
          // Try to manually parse the fixed JSON
          try {
            const parsedJson = JSON.parse(preprocessedText);
            
            // Validate against our schema
            const parsedResult = OutputSchema.safeParse(parsedJson);
            if (parsedResult.success) {
              logger.info('Successfully parsed preprocessed response');
              result = { object: parsedResult.data };
            } else {
              logger.error('Schema validation failed for preprocessed response', parsedResult.error);
              
              // Try to extract items manually if schema validation fails
              if (parsedJson && parsedJson.items && Array.isArray(parsedJson.items)) {
                logger.info('Attempting to extract and sanitize items manually');
                
                // Filter and sanitize items
                const sanitizedItems = parsedJson.items
                  .filter((item: any) => item && typeof item === 'object' && item.name)
                  .map((item: any) => ({
                    name: String(item.name || 'Unnamed Item'),
                    description: String(item.description || ''),
                    timestamp: typeof item.timestamp === 'number' 
                      ? Math.round(item.timestamp * 10) / 10 
                      : (formattedScratchItems.length > 0 ? formattedScratchItems[0].timestamp : 0),
                    estimated_value: typeof item.estimated_value === 'number' 
                      ? item.estimated_value 
                      : null
                  }));
                
                if (sanitizedItems.length > 0) {
                  logger.info(`Extracted ${sanitizedItems.length} valid items manually`);
                  result = { object: { items: sanitizedItems } };
                } else {
                  throw new Error('Could not extract any valid items from malformed response');
                }
              } else {
                throw new Error('Schema validation failed and no items found in response');
              }
            }
          } catch (parseError) {
            logger.error('Failed to parse preprocessed response', parseError);
            
            // Last resort: Try to extract items using regex patterns
            logger.info('Attempting emergency item extraction using regex');
            try {
              // @ts-expect-error - Emergency fallback code using any types for recovery
              const itemPattern = /"name"\s*:\s*"([^"]+)"[^}]*"description"\s*:\s*"([^"]+)"[^}]*("timestamp"\s*:\s*(\d+\.?\d*)|"estimated_value"\s*:\s*(\d+\.?\d*))/g;
              const matches = [...preprocessedText.matchAll(itemPattern)];
              
              if (matches.length > 0) {
                logger.info(`Found ${matches.length} potential items using regex extraction`);
                // @ts-expect-error - Emergency fallback code using any types for recovery
                const extractedItems = matches.map((match, index) => ({
                  name: match[1] || `Item ${index+1}`,
                  description: match[2] || '',
                  timestamp: formattedScratchItems.length > 0 ? formattedScratchItems[0].timestamp : 0,
                  estimated_value: 0 // Default value
                }));
                
                result = { object: { items: extractedItems } };
              } else {
                // If all recovery attempts fail, fall back to using scratch items directly
                logger.info('All recovery methods failed, using scratch items directly');
                result = { 
                  object: { 
                    // @ts-expect-error - Emergency fallback code using any types for recovery
                    items: formattedScratchItems.map(item => ({
                      name: item.name,
                      description: item.description || '',
                      timestamp: item.timestamp,
                      estimated_value: item.estimated_value
                    }))
                  } 
                };
              }
            } catch (regexError) {
              logger.error('Emergency regex extraction failed', regexError);
              // Ultimate fallback: Use scratch items directly
              result = { 
                object: { 
                  items: formattedScratchItems.map((item: { name: string; description: string | null; timestamp: number; estimated_value: number | null }) => ({
                    name: item.name,
                    description: item.description || '',
                    timestamp: item.timestamp,
                    estimated_value: item.estimated_value
                  }))
                } 
              };
            }
          }
        } else {
          // If we can't get the error text, use scratch items as fallback
          logger.warn('Could not extract error text, using scratch items as fallback');
          result = { 
            object: { 
              items: formattedScratchItems.map((item: { name: string; description: string | null; timestamp: number; estimated_value: number | null }) => ({
                name: item.name,
                description: item.description || '',
                timestamp: item.timestamp,
                estimated_value: item.estimated_value
              }))
            } 
          };
        }
      }
      
      const analyzedItems = result.object.items || [];
      logger.info(`Generated ${analyzedItems.length} items from Gemini API`);
      
      // Adding timestamps and estimated values to items
      logger.info('Adding timestamps and estimated values to items');

      // Create array of new items to insert
      const itemsToInsert = analyzedItems.map((item: AnalyzedItem) => {
        // Sanitize timestamp - ensure it has only 1 decimal place
        let sanitizedTimestamp = 0;
        if (item.timestamp !== undefined && item.timestamp !== null) {
          sanitizedTimestamp = Math.round(item.timestamp * 10) / 10;
        } else if (formattedScratchItems.length > 0) {
          sanitizedTimestamp = formattedScratchItems[0].timestamp;
        }
        
        // Find matching scratch items to get estimated value
        const matchingScratchItems = formattedScratchItems.filter(
          scratchItem => scratchItem.name.toLowerCase() === item.name.toLowerCase()
        );
        
        // Get the estimated value from matching scratch items
        let sanitizedValue = null;
        if (matchingScratchItems.length > 0) {
          sanitizedValue = matchingScratchItems[0].estimated_value;
          logger.info(`Using estimated_value ${sanitizedValue} from matching scratch item for "${item.name}"`);
        } else {
          logger.info(`No matching scratch item found for "${item.name}", using null for estimated_value`);
        }

        return {
          name: item.name,
          description: item.description || '',
          asset_id: asset.id,
          user_id: user_id,
          source_id: item.id || null, // if we have a source ID
          mux_asset_id: asset.mux_asset_id,
          item_timestamp: sanitizedTimestamp,
          source_table: 'merged',
          estimated_value: sanitizedValue,
          media_type: 'item',
          media_url: '',
          is_source_video: false,
          source_video_id: asset.id,
          mux_playback_id: asset.mux_playback_id
        };
      });

      // Log the items being inserted
      logger.info('Inserting items into assets table with estimated values');
      itemsToInsert.forEach((item, index) => {
        // The actual estimated_value property on the itemsToInsert object
        logger.info(`Item ${index + 1}: ${item.name}, value to be inserted: ${JSON.stringify(item.estimated_value)}`);
      });

      // Log the final payload after all transformations
      logger.info(`Final insert payload after formatting: ${JSON.stringify(itemsToInsert.map((item) => ({
        name: item.name,
        estimated_value: item.estimated_value,
        type: typeof item.estimated_value
      })))}`);

      const { data: insertedItems, error: insertError } = await serviceClient
        .from('assets')
        .insert(itemsToInsert)
        .select('id, name, estimated_value');
  
      if (insertError) {
        logger.error(`Insert error details: ${JSON.stringify(insertError)}`);
        return handleError(
          new Error(`Failed to insert merged items: ${insertError.message}`),
          500
        );
      }
      
      logger.info(`Successfully inserted ${insertedItems?.length || 0} items from merge.`);
      if (insertedItems && insertedItems.length > 0) {
        logger.info('Inserted items details:');
        insertedItems.forEach((item, i) => {
          logger.info(`  Item ${i + 1}: ${item.name}, returned estimated_value: ${JSON.stringify(item.estimated_value)}, type: ${typeof item.estimated_value}`);
        });
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

      // Only delete scratch items if the environment variable allows it
      const shouldDeleteScratchItems = process.env.DELETE_SCRATCH_ITEMS_AFTER_MERGE === 'true';

      if (shouldDeleteScratchItems && formattedScratchItems.length > 0) {
        logger.info(`DELETE_SCRATCH_ITEMS_AFTER_MERGE is set to true, deleting ${formattedScratchItems.length} scratch items`);
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
      } else {
        logger.info(`Keeping scratch items after merge (DELETE_SCRATCH_ITEMS_AFTER_MERGE=${process.env.DELETE_SCRATCH_ITEMS_AFTER_MERGE})`);
      }

      // Return success response
      return corsJsonResponse({
        success: true,
        items: analyzedItems,
        message: 'Successfully merged transcript with scratch items',
      });
    } catch (error: unknown) {
      return handleError(error);
    }
  } catch (error: unknown) {
    return handleError(error);
  }
} 