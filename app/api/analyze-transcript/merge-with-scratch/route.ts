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
You are an insurance inspection assistant analyzing a video and transcript from a home inspection.

${transcript ? `I have a transcript from a home inspection video and a list of items that were detected in the video frames during recording.

Here is the transcript. This is the PRIMARY SOURCE OF TRUTH. When the user mentions any item in the transcript, ALWAYS prioritize these details over the AI vision detections:
--- TRANSCRIPT (PRIMARY SOURCE) ---
${transcript}
--- END OF TRANSCRIPT ---` : `I have a list of items that were detected in the video frames during a home inspection recording. There is no audio transcript available.`}

Here are the items detected in the video frames (name, description, timestamp in seconds, estimated value). These are SECONDARY references and should only be used when an item is NOT mentioned in the transcript:
${formattedScratchItems.length > 0 
  ? formattedScratchItems.map(item => 
      `- ${item.name}${item.description ? `: ${item.description}` : ''}${item.timestamp ? ` (at ${formatTimestamp(item.timestamp).toFixed(1)}s)` : ''}${item.estimated_value ? ` - Estimated Value: $${item.estimated_value}` : ''}`
    ).join('\n')
  : 'No items were detected in the video frames.'
}

Please analyze ${transcript ? 'both the transcript and' : ''} the detected items to create a single, consolidated list of all unique items for a home inventory. 

MERGING INSTRUCTIONS (CRITICAL):
1. If an item is mentioned in BOTH the transcript and the detected video frames:
   - Create ONLY ONE entry for that item (be smart about recognizing the same item even if named differently)
   - ALWAYS use the NAME from the transcript but make it MORE DESCRIPTIVE (2-3 words minimum)
   - ALWAYS use the DESCRIPTION from the transcript (enhanced with visual details if relevant)
   - ALWAYS use the EARLIEST TIMESTAMP from when the user first mentions the item in the transcript
   - For estimated value: if mentioned in transcript, use that value, otherwise use the value from similar scratch items

2. If an item appears ONLY in the transcript:
   - Use all details directly from the transcript
   - Make the name MORE DESCRIPTIVE (2-3 words minimum)
   - ALWAYS ASSIGN AN ESTIMATED VALUE - this should never be empty or null
   - If no value is explicitly mentioned, use the most similar item from scratch items as a reference, or provide a reasonable estimate

3. If an item appears ONLY in the visual detection (scratch_items):
   - Use all details from the visual detection including its timestamp and estimated value
   - Make the name MORE DESCRIPTIVE (2-3 words minimum) than the generic detection name

NAMING REQUIREMENTS:
- ALL item names must be 2-3 words minimum to be descriptive and distinct
- Generic names like just "Artwork" are NOT acceptable - use "Abstract Wall Artwork" or "Framed Flower Painting" instead
- For electronics, include the type, brand, or model if known (e.g., "Apple iPhone 14", "Dell Work Laptop")
- For furniture, include color, material, or style (e.g., "Brown Leather Sofa", "Wooden Storage Cabinet")

TIMESTAMP PRIORITY:
- For ANY item mentioned in the transcript, the timestamp MUST be from when the user FIRST mentions it
- NEVER use timestamps from visual detection for items that are mentioned in the transcript
- Round all timestamps to ONE decimal place (e.g., 2.0, 3.5)

DEDUPLICATION REQUIREMENTS:
- Be smart about recognizing the same items described differently (e.g., "iPhone"/"smartphone", "work computer"/"laptop")
- Don't create separate entries for the same item detected in multiple frames or mentioned multiple times
- If a transcript item can be matched to ANY scratch item, make sure to use the scratch item's estimated value

Pay special attention to match items that might be referred to differently. For example, if the transcript mentions a "work computer" and the visual detection found a "laptop" or "Dell laptop", these are likely the same item and should be merged using transcript details for name/description/timestamp but keeping the estimated value from the scratch item.

For each UNIQUE item in your final consolidated list:
1. Name: Clear, DESCRIPTIVE name (2-3 words minimum)
2. Description: Detailed description (from transcript if mentioned there)
3. Timestamp: When the item first appears or is first mentioned (MUST use transcript timing if mentioned there)
4. Estimated value: Required numeric amount in USD (NEVER return null or 0 for estimated value)

Return the result as a JSON array with this exact format:
{
  "items": [
    {
      "name": "Descriptive Item Name (2-3 words)",
      "description": "Detailed description",
      "timestamp": 2.0,
      "estimated_value": 100.00
    }
  ]
}

CRUCIAL FORMAT REQUIREMENTS:
- Format all timestamps as numbers with EXACTLY one decimal place (e.g., 2.0 or 2.1)
- Never use timestamps with multiple decimal places (e.g., avoid 2.0000000)
- All timestamps must be between 0 and the video duration
- Always include a positive numeric estimated_value for every item - this is MANDATORY
- NEVER return estimated_value as null, undefined, or 0
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