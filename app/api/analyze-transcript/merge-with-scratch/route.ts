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
  estimated_value: z.number(),
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
You are an insurance inspection assistant analyzing a home inspection video. You will be given a transcript (if available) and a list of items detected in video frames (scratch_items).
Your goal is to create a single, consolidated, and deduplicated list of all unique items for a home inventory.

${transcript ? `--- TRANSCRIPT (PRIMARY SOURCE) ---
${transcript}
--- END OF TRANSCRIPT ---

The transcript is the PRIMARY SOURCE OF TRUTH. When the user mentions an item, ALWAYS prioritize its details (name, description, timestamp) over the AI vision detections (scratch_items).` 
: `No audio transcript is available for this video. Rely solely on the visually detected scratch_items.`}

--- VISUALLY DETECTED ITEMS (SCRATCH_ITEMS - SECONDARY SOURCE) ---
${formattedScratchItems.length > 0 
  ? formattedScratchItems.map(item => 
      `- Name: ${item.name}\n  Description: ${item.description}\n  Timestamp: ${formatTimestamp(item.timestamp).toFixed(1)}s\n  Estimated Value: $${item.estimated_value}`
    ).join('\n\n')
  : 'No items were detected in the video frames.'
}
--- END OF SCRATCH_ITEMS ---

Please analyze all available information to create the final consolidated list.

CRITICAL MERGING, DEDUPLICATION, AND NAMING LOGIC:

1.  TIMELINE INTEGRATION:
    -   Carefully consider the timestamps of items from BOTH the transcript and scratch_items.
    -   If an item is mentioned in the transcript, its timestamp is when the user FIRST mentions it. This is the definitive timestamp.
    -   Merge items chronologically where possible, using timestamps to resolve order and duplicates.

2.  ADVANCED DEDUPLICATION (VERY IMPORTANT):
    -   IDENTICAL ITEMS IN SCRATCH_ITEMS: If the same physical item is detected in scratch_items across multiple consecutive timestamps (e.g., "White headphones case" at 0s, "white airpods pro case" at 2s, "white airpods pro" at 4s), these are VERY LIKELY the SAME ITEM. Create only ONE entry for it, using the name/description from the most detailed detection and the EARLIEST timestamp it appeared.
    -   DESCRIPTION COMPARISON: Don't just match by name. Compare item DESCRIPTIONS. If two items have very similar descriptions, they are likely the same item even if named slightly differently. Merge them into one.
    -   TRANSCRIPT vs. SCRATCH_ITEMS: If an item is in the transcript AND a similar item is in scratch_items:
        *   Create ONLY ONE entry.
        *   NAME: ALWAYS use the name from the transcript. Make it descriptive (2-3 words min).
        *   DESCRIPTION: ALWAYS use the description from the transcript (enhance with visual details from scratch_items if relevant and not contradictory).
        *   TIMESTAMP: ALWAYS use the EARLIEST timestamp from the transcript.
        *   ESTIMATED VALUE: Use the transcript's value if specified. If not, use the value from the BEST MATCHING scratch_item. If no match or no scratch_item value, provide a reasonable estimate.

3.  TRANSCRIPT-ONLY ITEMS:
    -   Name: Use transcript name; make it descriptive (2-3 words min).
    -   Description: Use transcript description.
    -   Timestamp: Use transcript timestamp.
    -   Estimated Value: ALWAYS assign one. If not in transcript, estimate reasonably (can use similar scratch_items as a guide if available).

4.  SCRATCH_ITEMS-ONLY ITEMS (after thorough deduplication):
    -   Name: Make it descriptive (2-3 words min), more so than the generic detection name.
    -   Description: Use its detailed description.
    -   Timestamp: Use its timestamp.
    -   Estimated Value: Use its estimated value.

5.  NAMING REQUIREMENTS (APPLIES TO ALL FINAL ITEMS):
    -   All item names must be 2-3 words minimum, descriptive, and distinct.
    -   Avoid generic names like "Artwork"; use "Abstract Wall Artwork" or "Framed Flower Painting".
    -   Electronics: Include type, brand/model if known (e.g., "Apple iPhone 14", "Dell Work Laptop").
    -   Furniture: Include color, material, or style (e.g., "Brown Leather Sofa", "Wooden Storage Cabinet").

OUTPUT FORMAT (JSON - items array):
{
  "items": [
    {
      "name": "Descriptive Item Name (2-3 words)",
      "description": "Detailed description from primary source, enhanced if appropriate.",
      "timestamp": 2.0, // Single decimal place
      "estimated_value": 100.00 // Positive numeric USD value, never null/0
    }
  ]
}

CRUCIAL FORMATTING & VALUE REQUIREMENTS:
-   Timestamps: Numbers with EXACTLY one decimal place (e.g., 2.0 or 2.1).
-   Estimated Value: Positive numeric USD value for EVERY item. NEVER null, undefined, or 0.
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
                  .filter((item: Record<string, unknown>) => item && typeof item === 'object' && item.name)
                  .map((item: Record<string, unknown>) => ({
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
              const itemPattern = /"name"\s*:\s*"([^"]+)"[^}]*"description"\s*:\s*"([^"]+)"[^}]*("timestamp"\s*:\s*(\d+\.?\d*)|"estimated_value"\s*:\s*(\d+\.?\d*))/g;
              const matches = [...preprocessedText.matchAll(itemPattern)];
              
              if (matches.length > 0) {
                logger.info(`Found ${matches.length} potential items using regex extraction`);
                const extractedItems = matches.map((match: RegExpMatchArray, index: number) => ({
                  name: match[1] || `Item ${index+1}`,
                  description: match[2] || '',
                  timestamp: formattedScratchItems.length > 0 ? formattedScratchItems[0].timestamp : 0,
                  estimated_value: 0 // Default value, since schema now requires it
                }));
                
                result = { object: { items: extractedItems } };
              } else {
                // If all recovery attempts fail, fall back to using scratch items directly
                logger.info('All recovery methods failed, using scratch items directly');
                result = { 
                  object: { 
                    items: formattedScratchItems.map((item: typeof formattedScratchItems[0]) => ({
                      name: item.name,
                      description: item.description || '',
                      timestamp: item.timestamp,
                      estimated_value: item.estimated_value !== null ? item.estimated_value : 0 // Ensure a number
                    }))
                  } 
                };
              }
            } catch (regexError: unknown) {
              logger.error('Error during regex extraction:', regexError);
              // Ultimate fallback: use scratch items if regex itself errors
              logger.info('Regex extraction failed, using scratch items directly as ultimate fallback');
              result = { 
                object: { 
                  items: formattedScratchItems.map((item: typeof formattedScratchItems[0]) => ({
                    name: item.name,
                    description: item.description || '',
                    timestamp: item.timestamp,
                    estimated_value: item.estimated_value !== null ? item.estimated_value : 0 // Ensure a number
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
              items: formattedScratchItems.map((item: typeof formattedScratchItems[0]) => ({
                name: item.name,
                description: item.description || '',
                timestamp: item.timestamp,
                estimated_value: item.estimated_value !== null ? item.estimated_value : 0 // Ensure a number
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
          scratchItem => {
            // More flexible matching - check if names are similar
            const itemNameLower = item.name.toLowerCase();
            const scratchNameLower = scratchItem.name.toLowerCase();
            
            // Direct match
            if (itemNameLower === scratchNameLower) return true;
            
            // Contains match (iPhone contains phone, laptop contains computer, etc)
            if (itemNameLower.includes(scratchNameLower) || scratchNameLower.includes(itemNameLower)) return true;
            
            // Special cases for common device types
            if ((itemNameLower.includes('phone') && scratchNameLower.includes('smartphone')) ||
                (itemNameLower.includes('iphone') && scratchNameLower.includes('smartphone')) ||
                (itemNameLower.includes('computer') && scratchNameLower.includes('laptop')) ||
                (itemNameLower.includes('laptop') && scratchNameLower.includes('computer'))) {
              return true;
            }
            
            return false;
          }
        );
        
        // Get estimated value with fallbacks to ensure it's never null
        let sanitizedValue = null;
        
        // First try: Use value from item (LLM assigned value)
        if (item.estimated_value !== undefined && item.estimated_value !== null && item.estimated_value > 0) {
          sanitizedValue = item.estimated_value;
          logger.info(`Using LLM-provided estimated_value ${sanitizedValue} for "${item.name}"`);
        } 
        // Second try: Find matching scratch item value
        else if (matchingScratchItems.length > 0 && matchingScratchItems[0].estimated_value !== null) {
          sanitizedValue = matchingScratchItems[0].estimated_value;
          logger.info(`Using estimated_value ${sanitizedValue} from matching scratch item "${matchingScratchItems[0].name}" for "${item.name}"`);
        } 
        // Third try: Set fallback value based on item type
        else {
          // Assign reasonable default values based on item category
          const itemNameLower = item.name.toLowerCase();
          if (itemNameLower.includes('phone') || itemNameLower.includes('iphone') || itemNameLower.includes('smartphone')) {
            sanitizedValue = 800;
          } else if (itemNameLower.includes('laptop') || itemNameLower.includes('computer') || itemNameLower.includes('macbook')) {
            sanitizedValue = 1200;
          } else if (itemNameLower.includes('sofa') || itemNameLower.includes('couch')) {
            sanitizedValue = 600;
          } else if (itemNameLower.includes('tv') || itemNameLower.includes('television')) {
            sanitizedValue = 500;
          } else if (itemNameLower.includes('artwork') || itemNameLower.includes('painting') || itemNameLower.includes('frame')) {
            sanitizedValue = 150;
          } else {
            // Last resort fallback
            sanitizedValue = 100;
          }
          logger.info(`No value found for "${item.name}", using fallback value: ${sanitizedValue}`);
        }

        return {
          name: item.name,
          description: item.description || '',
          user_id: user_id,
          mux_asset_id: asset.mux_asset_id,
          item_timestamp: sanitizedTimestamp,
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
      itemsToInsert.forEach((item: AnalyzedItem & { estimated_value: number | null }, index: number) => {
        // The actual estimated_value property on the itemsToInsert object
        logger.info(`Item ${index + 1}: ${item.name}, value to be inserted: ${JSON.stringify(item.estimated_value)}`);
      });

      // Log the final payload after all transformations
      logger.info(`Final insert payload after formatting: ${JSON.stringify(itemsToInsert.map((item: AnalyzedItem & { estimated_value: number | null }) => ({
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