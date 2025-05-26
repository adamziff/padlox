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
  tag_names: z.array(z.string()).optional(),
  room_name: z.string().optional(),
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
  tag_names?: string[];
  room_name?: string;
  id?: string; // Will be populated after insertion
}

// Define a minimal local type for the Deepgram word structure
interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  punctuated_word?: string;
}

interface DeepgramAlternative {
  words: DeepgramWord[];
  // other properties like transcript, confidence etc. can be added if needed
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramResults {
  channels: DeepgramChannel[];
}

interface MinimalDeepgramResponse {
  results?: DeepgramResults;
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

// Helper to provide intelligent fallback tags and rooms based on item names
const generateFallbackTagsAndRoom = (itemName: string, description: string, availableTagNames: string[], availableRoomNames: string[]): { tag_names?: string[], room_name?: string } => {
  const nameLower = itemName.toLowerCase();
  const descLower = description.toLowerCase();
  const combined = `${nameLower} ${descLower}`;
  
  // Generate fallback tags based on item characteristics
  const fallbackTags: string[] = [];
  
  // Electronics tags
  if (combined.includes('phone') || combined.includes('smartphone') || combined.includes('iphone') || combined.includes('android')) {
    fallbackTags.push('Electronics', 'Personal Items');
  } else if (combined.includes('laptop') || combined.includes('computer') || combined.includes('macbook') || combined.includes('pc')) {
    fallbackTags.push('Electronics', 'Office Equipment');
  } else if (combined.includes('tv') || combined.includes('television') || combined.includes('monitor')) {
    fallbackTags.push('Electronics', 'Entertainment');
  } else if (combined.includes('tablet') || combined.includes('ipad')) {
    fallbackTags.push('Electronics', 'Personal Items');
  } else if (combined.includes('playstation') || combined.includes('xbox') || combined.includes('console') || combined.includes('gaming')) {
    fallbackTags.push('Electronics', 'Entertainment');
  } else if (combined.includes('fridge') || combined.includes('refrigerator') || combined.includes('freezer')) {
    fallbackTags.push('Appliances', 'Kitchenware');
  }
  
  // Furniture tags
  else if (combined.includes('bed') || combined.includes('mattress') || combined.includes('dresser') || combined.includes('nightstand')) {
    fallbackTags.push('Furniture', 'Bedroom');
  } else if (combined.includes('sofa') || combined.includes('couch') || combined.includes('chair') || combined.includes('table') || combined.includes('desk') || combined.includes('stand')) {
    fallbackTags.push('Furniture');
  }
  
  // Clothing and personal items
  else if (combined.includes('wallet') || combined.includes('purse') || combined.includes('bag') || combined.includes('backpack')) {
    fallbackTags.push('Personal Items', 'Accessories');
  } else if (combined.includes('clothes') || combined.includes('shirt') || combined.includes('pants') || combined.includes('dress') || combined.includes('jacket')) {
    fallbackTags.push('Clothing');
  } else if (combined.includes('jewelry') || combined.includes('ring') || combined.includes('necklace') || combined.includes('watch')) {
    fallbackTags.push('Jewelry', 'Personal Items');
  }
  
  // Kitchen items
  else if (combined.includes('microwave') || combined.includes('refrigerator') || combined.includes('oven') || combined.includes('coffee') || combined.includes('kitchen')) {
    fallbackTags.push('Kitchenware', 'Appliances');
  }
  
  // Documents and media
  else if (combined.includes('document') || combined.includes('paper') || combined.includes('book') || combined.includes('file')) {
    fallbackTags.push('Documents');
  } else if (combined.includes('artwork') || combined.includes('painting') || combined.includes('frame') || combined.includes('picture')) {
    fallbackTags.push('Artwork', 'Decor');
  } else if (combined.includes('vase') || combined.includes('plant') || combined.includes('flower') || combined.includes('orchid') || combined.includes('decoration')) {
    fallbackTags.push('Decor', 'Personal Items');
  }
  
  // Tools and equipment
  else if (combined.includes('tool') || combined.includes('drill') || combined.includes('hammer') || combined.includes('equipment')) {
    fallbackTags.push('Tools');
  } else if (combined.includes('sport') || combined.includes('exercise') || combined.includes('bike') || combined.includes('ball')) {
    fallbackTags.push('Sports Equipment');
  }
  
  // Default to general categories if no specific match
  if (fallbackTags.length === 0) {
    fallbackTags.push('Personal Items');
  }
  
  // Filter to only use tags that exist or add common ones that should exist
  const finalTags = fallbackTags.filter(tag => 
    availableTagNames.includes(tag) || 
    ['Electronics', 'Furniture', 'Personal Items', 'Clothing', 'Kitchenware', 'Documents', 'Tools', 'Sports Equipment', 'Jewelry', 'Artwork', 'Office Equipment', 'Entertainment', 'Bedroom', 'Accessories', 'Appliances', 'Decor'].includes(tag)
  );
  
  // Generate fallback room based on item characteristics
  let fallbackRoom: string | undefined;
  
  if (combined.includes('kitchen') || combined.includes('microwave') || combined.includes('refrigerator') || combined.includes('coffee') || combined.includes('oven') || combined.includes('fridge')) {
    fallbackRoom = 'Kitchen';
  } else if (combined.includes('bedroom') || combined.includes('bed') || combined.includes('mattress') || combined.includes('dresser') || combined.includes('nightstand')) {
    fallbackRoom = 'Bedroom';
  } else if (combined.includes('living') || combined.includes('sofa') || combined.includes('couch') || combined.includes('tv') || combined.includes('television')) {
    fallbackRoom = 'Living Room';
  } else if (combined.includes('office') || combined.includes('desk') || combined.includes('computer') || combined.includes('laptop') || combined.includes('document')) {
    fallbackRoom = 'Office';
  } else if (combined.includes('bathroom') || combined.includes('shower') || combined.includes('bath')) {
    fallbackRoom = 'Bathroom';
  } else if (combined.includes('garage') || combined.includes('car') || combined.includes('tool')) {
    fallbackRoom = 'Garage';
  } else if (combined.includes('dining') || combined.includes('table')) {
    fallbackRoom = 'Dining Room';
  } else if (combined.includes('basement') || combined.includes('storage')) {
    fallbackRoom = 'Basement';
  }
  
  // Only use room if it exists in available rooms or is a common room
  if (fallbackRoom && (availableRoomNames.includes(fallbackRoom) || 
      ['Kitchen', 'Living Room', 'Bedroom', 'Office', 'Bathroom', 'Garage', 'Dining Room', 'Basement'].includes(fallbackRoom))) {
    // Room is valid
  } else {
    fallbackRoom = undefined;
  }
  
  return {
    tag_names: finalTags.length > 0 ? finalTags : undefined,
    room_name: fallbackRoom
  };
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

    // More detailed logging of the received transcript
    if (transcript) {
      logger.info(`Received transcript. Type: ${typeof transcript}`);
      if (typeof transcript === 'object' && transcript !== null) {
        logger.info(`Transcript object keys: ${Object.keys(transcript).join(', ')}`);
        // Log a snippet of results if it exists, to confirm structure
        const minimalTranscript = transcript as MinimalDeepgramResponse;
        if (minimalTranscript?.results?.channels?.[0]?.alternatives?.[0]?.words?.length) {
          logger.info(`Transcript contains ${minimalTranscript.results.channels[0].alternatives[0].words.length} words.`);
        } else {
          logger.warn('Transcript object received, but does not seem to contain word-level data at the expected path.');
        }
      } else if (typeof transcript === 'string') {
        logger.info(`Transcript is a string, length: ${transcript.length}`);
      }
    } else {
      logger.warn('No transcript data received in the request body.');
    }

    console.log(`[Merge API] Request params (after detailed transcript log): user_id=${user_id}, asset_id=${asset_id}, mux_asset_id=${mux_asset_id}`);

    // Check for required fields - note that transcript is now optional if we have user_id and an asset ID
    if (!user_id || !(asset_id || mux_asset_id)) {
      return handleError(
        new Error('Missing required fields: user_id and either asset_id or mux_asset_id'),
        400
      );
    }

    // Create a Supabase client
    const serviceClient = createServiceSupabaseClient();

    // Fetch user's tags and rooms
    const { data: userTags, error: userTagsError } = await serviceClient
      .from('tags')
      .select('name')
      .eq('user_id', user_id);

    if (userTagsError) {
      logger.warn('Error fetching user tags:', userTagsError.message);
      // Continue without tags if fetch fails
    }
    const availableTagNames = userTags?.map(t => t.name) || [];

    const { data: userRooms, error: userRoomsError } = await serviceClient
      .from('rooms')
      .select('name')
      .eq('user_id', user_id);

    if (userRoomsError) {
      logger.warn('Error fetching user rooms:', userRoomsError.message);
      // Continue without rooms if fetch fails
    }
    const availableRoomNames = userRooms?.map(r => r.name) || [];

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

    // Prepare detailed transcript context if transcript is available
    let detailedTranscriptContext = '';
    if (transcript && typeof transcript === 'object') { 
      try {
        const transcriptDataObject: MinimalDeepgramResponse = typeof transcript === 'string' ? JSON.parse(transcript) : transcript;
        
        if (transcriptDataObject?.results?.channels?.[0]?.alternatives?.[0]?.words) {
          const wordsWithTimestamps = transcriptDataObject.results.channels[0].alternatives[0].words;
          detailedTranscriptContext = JSON.stringify(wordsWithTimestamps.map((w: DeepgramWord) => ({ w: w.punctuated_word || w.word, s: w.start, e: w.end })));
          logger.info('Successfully created detailed transcript context for the prompt.');
        } else {
          logger.warn('Transcript data is present but lacks the expected structure for detailed word timestamps.');
        }
      } catch (e) {
        logger.error('Error processing transcript data for detailed context:', e);
      }
    }

    logger.info(`Found ${formattedScratchItems.length} scratch items to merge with transcript`);

    // Create a prompt that includes both transcript and scratch items
    const prompt = `
You are an insurance inspection assistant analyzing a home inspection video. You will be given a transcript (if available) and a list of items detected in video frames (scratch_items).
Your goal is to create a single, consolidated, and deduplicated list of all unique items for a home inventory.

${transcript ?
  `--- TRANSCRIPT (PRIMARY SOURCE FOR ITEM IDENTIFICATION AND ROOM ASSIGNMENT) ---\n${typeof transcript === 'string' ? transcript : JSON.stringify(transcript) /* Fallback to stringifying if not already a string */}\n${detailedTranscriptContext ? `\\n\\n--- DETAILED TRANSCRIPT WORD TIMESTAMPS (FOR PRECISE ITEM TIMESTAMPING) ---\n${detailedTranscriptContext}` : ''}\n--- END OF TRANSCRIPT DATA ---`
: `No audio transcript is available for this video. Rely solely on the visually detected scratch_items for item identification. Room assignment will not be possible without a transcript.`}

--- VISUALLY DETECTED ITEMS (SCRATCH_ITEMS - SECONDARY SOURCE FOR ITEM DETAILS AND TAGGING) ---\n${formattedScratchItems.length > 0
  ? formattedScratchItems.map(item =>
      `- Name: ${item.name}\\n  Description: ${item.description}\\n  Timestamp: ${formatTimestamp(item.timestamp).toFixed(1)}s\\n  Estimated Value: $${item.estimated_value}`
    ).join('\\n\\n')
  : 'No items were detected in the video frames.'
}
--- END OF SCRATCH_ITEMS ---

--- USER'S EXISTING TAGS AND ROOMS ---
Available Tags: ${availableTagNames.length > 0 ? availableTagNames.join(', ') : 'No tags defined by user.'}
Available Rooms: ${availableRoomNames.length > 0 ? availableRoomNames.join(', ') : 'No rooms defined by user.'}

Please analyze all available information to create the final consolidated list.

CRITICAL MERGING, DEDUPLICATION, AND NAMING LOGIC:

1.  TIMELINE INTEGRATION & TRANSCRIPT TIMESTAMPING:
    -   Carefully consider the timestamps of items from BOTH the transcript and scratch_items.
    -   If an item is mentioned in the transcript, its timestamp is when the user FIRST mentions it. **Use the start time ('s') from the DETAILED TRANSCRIPT WORD TIMESTAMPS for this.** This is the definitive timestamp.
    -   Merge items chronologically where possible, using timestamps to resolve order and duplicates.

2.  ADVANCED DEDUPLICATION (VERY IMPORTANT):
    -   AGGRESSIVE SCRATCH_ITEM DEDUPLICATION: Items detected in \`scratch_items\` at close timestamps (e.g., within a few seconds of each other) AND having similar or related names (e.g., "Black Portable Speaker" vs. "Bose Pro Plus Speaker" for the *same speaker*; "white case" vs. "Airpods case" for the *same case*) OR similar descriptions ARE EXTREMELY LIKELY TO BE THE SAME PHYSICAL ITEM. "Similar or related names" means that even if the exact wording differs (like a generic name vs. a branded name), if they refer to the same type of object and potentially share characteristics evident from their names/descriptions, they should be prime candidates for merging. Your default assumption MUST BE to merge such items if their timestamps are close and their descriptions do not contradict. For instance, if "Black Portable Speaker" at 2.0s and "Bose Pro Plus Speaker" at 4.0s both describe a black speaker, they are almost certainly the same item. Create only ONE entry for these consolidated items. When merging, use the name and description from the most detailed, specific, or accurate detection among the duplicates (e.g., prefer "Bose Pro Plus Speaker" over "Black Portable Speaker" if they are deemed the same item and "Bose Pro Plus Speaker" is more specific). Always assign the EARLIEST timestamp from the group of duplicates.
    -   DESCRIPTION COMPARISON FOR ALL ITEMS: Don't just match by name. Compare item DESCRIPTIONS. If two items (from scratch_items, or one from transcript and one from scratch_items) have very similar descriptions, they are likely the same item even if named slightly differently. Merge them into one, prioritizing transcript information if available (see next point).
    -   TRANSCRIPT vs. SCRATCH_ITEMS: If an item is in the transcript AND a similar item is in scratch_items:
        *   Create ONLY ONE entry.
        *   NAME: ALWAYS use the name from the transcript. Make it descriptive (2-3 words min).
        *   DESCRIPTION: ALWAYS use the description from the transcript (enhance with visual details from scratch_items if relevant and not contradictory).
        *   TIMESTAMP: ALWAYS use the EARLIEST start time ('s') from the DETAILED TRANSCRIPT WORD TIMESTAMPS for when the item was first mentioned.
        *   ESTIMATED VALUE: Use the transcript's value if specified. If not, use the value from the BEST MATCHING scratch_item. If no match or no scratch_item value, provide a reasonable estimate.

3.  TRANSCRIPT-ONLY ITEMS:
    -   Name: Use transcript name; make it descriptive (2-3 words min).
    -   Description: Use transcript description.
    -   Timestamp: Use the EARLIEST start time ('s') from the DETAILED TRANSCRIPT WORD TIMESTAMPS.
    -   Estimated Value: ALWAYS assign one. If not in transcript, estimate reasonably (can use similar scratch_items as a guide if available).

4.  SCRATCH_ITEMS-ONLY ITEMS (after thorough deduplication):
    -   Name: Make it descriptive (2-3 words min), more so than the generic detection name.
    -   Description: Use its detailed description.
    -   Timestamp: Use its timestamp.
    -   Estimated Value: Use its estimated value.

5.  ROOM ASSIGNMENT (BASED **ONLY** ON TRANSCRIPT):
    -   For each item identified primarily from the transcript, suggest a \`room_name\`.
    -   The \`room_name\` should be based on contextual clues within the transcript (e.g., "in the kitchen, I see a toaster", "moving to the living room...").
    -   If the transcript suggests a room not in the "Available Rooms" list, **STILL PROVIDE THE SUGGESTED ROOM NAME**. The system will create it if needed.
    -   If no clear room context can be inferred from the transcript for an item, do not assign a \`room_name\`.

6.  TAGGING (BASED ON **BOTH** TRANSCRIPT AND SCRATCH_ITEMS):
    -   For each item, suggest an array of \`tag_names\` based on its characteristics and context from both the transcript and scratch_items.
    -   If appropriate tags are suggested that are not in the "Available Tags" list, **STILL PROVIDE THE SUGGESTED TAG NAMES**. The system will create them if needed.
    -   Only assign tags if there's a clear and logical fit. If no tags are suitable, do not assign any.

7.  NAMING REQUIREMENTS (APPLIES TO ALL FINAL ITEMS):
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
      "estimated_value": 100.00, // Positive numeric USD value, never null/0
      "tag_names": ["Electronics", "Important", "New Suggested Tag"], // Optional, suggest new if appropriate
      "room_name": "Office" // Optional, suggest new if appropriate (based on transcript)
    }
  ]
}

CRUCIAL FORMATTING & VALUE REQUIREMENTS:
-   Timestamps: Numbers with EXACTLY one decimal place (e.g., 2.0 or 2.1).
-   Estimated Value: Positive numeric USD value for EVERY item. NEVER null, undefined, or 0.
-   tag_names: Must be an array of strings. You can suggest tags not in the "Available Tags" list. Omit if no suitable tags.
-   room_name: Must be a single string. You can suggest a room not in the "Available Rooms" list if indicated by the transcript. Omit if no suitable room.
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

        // Specifically log estimated values, tags, and rooms from the raw response
        if (result.object.items && result.object.items.length > 0) {
          logger.info('Details in raw Gemini response:');
          result.object.items.forEach((item, i) => {
            logger.info(`  Item ${i + 1}: ${item.name}, raw estimated_value: ${JSON.stringify(item.estimated_value)}, type: ${typeof item.estimated_value}, tag_names: ${JSON.stringify(item.tag_names)}, room_name: ${item.room_name}`);
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
                  .map((item: Record<string, unknown>) => {
                    const itemName = String(item.name || 'Unnamed Item');
                    const itemDescription = String(item.description || '');
                    
                    // Try to use AI suggestions first, fallback to intelligent suggestions if missing
                    let tag_names = Array.isArray(item.tag_names) ? item.tag_names.map(String) : undefined;
                    let room_name = typeof item.room_name === 'string' ? item.room_name : undefined;
                    
                    // If AI suggestions are missing, generate intelligent fallbacks
                    if (!tag_names && !room_name) {
                      const fallbackTagsAndRoom = generateFallbackTagsAndRoom(itemName, itemDescription, availableTagNames, availableRoomNames);
                      tag_names = fallbackTagsAndRoom.tag_names;
                      room_name = fallbackTagsAndRoom.room_name;
                    }
                    
                    return {
                      name: itemName,
                      description: itemDescription,
                      timestamp: typeof item.timestamp === 'number'
                        ? Math.round(item.timestamp * 10) / 10
                        : (formattedScratchItems.length > 0 ? formattedScratchItems[0].timestamp : 0),
                      estimated_value: typeof item.estimated_value === 'number'
                        ? item.estimated_value
                        : null,
                      tag_names,
                      room_name,
                    };
                  });

                if (sanitizedItems.length > 0) {
                  logger.info(`Extracted ${sanitizedItems.length} valid items manually`);
                  // Ensure the result conforms to OutputSchema, even if some fields are missing
                  const validatedItems = sanitizedItems.map((item: AnalyzedItem) => ({
                      name: item.name,
                      description: item.description,
                      timestamp: item.timestamp,
                      estimated_value: item.estimated_value === null ? 0 : item.estimated_value, // Ensure estimated_value is a number
                      tag_names: item.tag_names,
                      room_name: item.room_name,
                  }));
                  result = { object: { items: validatedItems } };
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
                const extractedItems = matches.map((match: RegExpMatchArray, index: number) => {
                  const itemName = match[1] || `Item ${index+1}`;
                  const itemDescription = match[2] || '';
                  const fallbackTagsAndRoom = generateFallbackTagsAndRoom(itemName, itemDescription, availableTagNames, availableRoomNames);
                  
                  return {
                    name: itemName,
                    description: itemDescription,
                    timestamp: formattedScratchItems.length > 0 ? formattedScratchItems[0].timestamp : 0,
                    estimated_value: 0, // Default value, since schema now requires it
                    tag_names: fallbackTagsAndRoom.tag_names,
                    room_name: fallbackTagsAndRoom.room_name,
                  };
                });

                result = { object: { items: extractedItems } };
              } else {
                // If all recovery attempts fail, fall back to using scratch items directly
                logger.info('All recovery methods failed, using scratch items directly');
                result = {
                  object: {
                    items: formattedScratchItems.map((item: typeof formattedScratchItems[0]) => {
                      const fallbackTagsAndRoom = generateFallbackTagsAndRoom(item.name, item.description || '', availableTagNames, availableRoomNames);
                      
                      return {
                        name: item.name,
                        description: item.description || '',
                        timestamp: item.timestamp,
                        estimated_value: item.estimated_value !== null ? item.estimated_value : 0, // Ensure a number
                        tag_names: fallbackTagsAndRoom.tag_names,
                        room_name: fallbackTagsAndRoom.room_name,
                      };
                    })
                  }
                };
              }
            } catch (regexError: unknown) {
              logger.error('Error during regex extraction:', regexError);
                              // Ultimate fallback: use scratch items if regex itself errors
                logger.info('Regex extraction failed, using scratch items directly as ultimate fallback');
                result = {
                  object: {
                    items: formattedScratchItems.map((item: typeof formattedScratchItems[0]) => {
                      const fallbackTagsAndRoom = generateFallbackTagsAndRoom(item.name, item.description || '', availableTagNames, availableRoomNames);
                      
                      return {
                        name: item.name,
                        description: item.description || '',
                        timestamp: item.timestamp,
                        estimated_value: item.estimated_value !== null ? item.estimated_value : 0, // Ensure a number
                        tag_names: fallbackTagsAndRoom.tag_names,
                        room_name: fallbackTagsAndRoom.room_name,
                      };
                    })
                  }
                };
            }
          }
        } else {
          // If we can't get the error text, use scratch items as fallback
          logger.warn('Could not extract error text, using scratch items as fallback');
          result = {
            object: {
              items: formattedScratchItems.map((item: typeof formattedScratchItems[0]) => {
                const fallbackTagsAndRoom = generateFallbackTagsAndRoom(item.name, item.description || '', availableTagNames, availableRoomNames);
                
                return {
                  name: item.name,
                  description: item.description || '',
                  timestamp: item.timestamp,
                  estimated_value: item.estimated_value !== null ? item.estimated_value : 0, // Ensure a number
                  tag_names: fallbackTagsAndRoom.tag_names,
                  room_name: fallbackTagsAndRoom.room_name,
                };
              })
            }
          };
        }
      }

      const analyzedItems: AnalyzedItem[] = result.object.items || [];
      logger.info(`Generated ${analyzedItems.length} items from Gemini API`);

      // Apply fallback tagging for items that don't have tag_names or room_name
      const itemsWithFallback = analyzedItems.map((item: AnalyzedItem) => {
        if (!item.tag_names || !item.room_name) {
          const fallbackTagsAndRoom = generateFallbackTagsAndRoom(
            item.name, 
            item.description || '', 
            availableTagNames, 
            availableRoomNames
          );
          
          return {
            ...item,
            tag_names: item.tag_names || fallbackTagsAndRoom.tag_names,
            room_name: item.room_name || fallbackTagsAndRoom.room_name,
          };
        }
        return item;
      });

      logger.info(`Applied fallback tagging logic to items missing tag_names or room_name`);

      // Prepare items for insertion (without tag/room linking yet)
      const itemsToInsertData = itemsWithFallback.map((item: AnalyzedItem) => {
        let sanitizedTimestamp = 0;
        if (item.timestamp !== undefined && item.timestamp !== null) {
          sanitizedTimestamp = Math.round(item.timestamp * 10) / 10;
        } else if (formattedScratchItems.length > 0) {
          sanitizedTimestamp = formattedScratchItems[0].timestamp;
        }

        const matchingScratchItems = formattedScratchItems.filter(
          scratchItem => {
            const itemNameLower = item.name.toLowerCase();
            const scratchNameLower = scratchItem.name.toLowerCase();
            if (itemNameLower === scratchNameLower) return true;
            if (itemNameLower.includes(scratchNameLower) || scratchNameLower.includes(itemNameLower)) return true;
            if ((itemNameLower.includes('phone') && scratchNameLower.includes('smartphone')) ||
                (itemNameLower.includes('iphone') && scratchNameLower.includes('smartphone')) ||
                (itemNameLower.includes('computer') && scratchNameLower.includes('laptop')) ||
                (itemNameLower.includes('laptop') && scratchNameLower.includes('computer'))) {
              return true;
            }
            return false;
          }
        );

        let sanitizedValue: number;
        if (item.estimated_value !== undefined && item.estimated_value !== null && item.estimated_value > 0) {
          sanitizedValue = item.estimated_value;
        } else if (matchingScratchItems.length > 0 && matchingScratchItems[0].estimated_value !== null && matchingScratchItems[0].estimated_value !== undefined && matchingScratchItems[0].estimated_value > 0) {
          sanitizedValue = matchingScratchItems[0].estimated_value;
        } else {
          const itemNameLower = item.name.toLowerCase();
          if (itemNameLower.includes('phone') || itemNameLower.includes('iphone') || itemNameLower.includes('smartphone')) sanitizedValue = 800;
          else if (itemNameLower.includes('laptop') || itemNameLower.includes('computer') || itemNameLower.includes('macbook')) sanitizedValue = 1200;
          else if (itemNameLower.includes('sofa') || itemNameLower.includes('couch')) sanitizedValue = 600;
          else if (itemNameLower.includes('tv') || itemNameLower.includes('television')) sanitizedValue = 500;
          else if (itemNameLower.includes('artwork') || itemNameLower.includes('painting') || itemNameLower.includes('frame')) sanitizedValue = 150;
          else sanitizedValue = 100;
        }
        logger.info(`Value for "${item.name}": ${sanitizedValue}`);

        return {
          // Data for 'assets' table
          name: item.name,
          description: item.description || '',
          user_id: user_id,
          mux_asset_id: asset.mux_asset_id, // Use the parent video's mux_asset_id
          item_timestamp: sanitizedTimestamp,
          estimated_value: sanitizedValue,
          media_type: 'item' as const, // Explicitly type as 'item'
          media_url: '', // No direct media URL for items derived from video
          is_source_video: false,
          source_video_id: asset.id, // Link to the original video asset
          mux_playback_id: asset.mux_playback_id, // Inherit playback ID for context if needed
          // Store AI suggested tag/room names temporarily for post-insertion linking
          ai_suggested_tag_names: item.tag_names,
          ai_suggested_room_name: item.room_name,
        };
      });

      logger.info('Inserting items into assets table...');
      const { data: insertedItems, error: insertError } = await serviceClient
        .from('assets')
        .insert(itemsToInsertData.map(item => ({
          name: item.name,
          description: item.description,
          user_id: item.user_id,
          mux_asset_id: item.mux_asset_id,
          item_timestamp: item.item_timestamp,
          estimated_value: item.estimated_value,
          media_type: item.media_type,
          media_url: item.media_url,
          is_source_video: item.is_source_video,
          source_video_id: item.source_video_id,
          mux_playback_id: item.mux_playback_id,
        })))
        .select('id, name, estimated_value'); // Select ID for linking

      if (insertError) {
        logger.error(`Insert error details: ${JSON.stringify(insertError)}`);
        return handleError(new Error(`Failed to insert merged items: ${insertError.message}`), 500);
      }

      logger.info(`Successfully inserted ${insertedItems?.length || 0} items from merge.`);

      // --- Link Tags and Rooms ---
      if (insertedItems && insertedItems.length > 0) {
        for (let i = 0; i < insertedItems.length; i++) {
          const dbItem = insertedItems[i];
          const aiItem = itemsWithFallback[i]; // Corresponding AI item with tag/room suggestions

          // Link Tags (Create if not exist)
          if (aiItem.tag_names && aiItem.tag_names.length > 0) {
            const tagIdsToLink: string[] = [];
            for (const tagName of aiItem.tag_names) {
              let tagId: string | null = null;

              // Check if tag exists
              const { data: existingTag, error: fetchTagError } = await serviceClient
                .from('tags')
                .select('id')
                .eq('user_id', user_id)
                .eq('name', tagName)
                .single();

              if (fetchTagError && fetchTagError.code !== 'PGRST116') { // PGRST116: 'No rows found'
                logger.warn(`Error fetching tag "${tagName}": ${fetchTagError.message}`);
              } else if (existingTag) {
                tagId = existingTag.id;
              } else {
                // Tag does not exist, create it
                logger.info(`Tag "${tagName}" not found for user. Creating it.`);
                const { data: newTag, error: createTagError } = await serviceClient
                  .from('tags')
                  .insert({ user_id: user_id, name: tagName })
                  .select('id')
                  .single();

                if (createTagError) {
                  logger.error(`Error creating tag "${tagName}": ${createTagError.message}`);
                } else if (newTag) {
                  tagId = newTag.id;
                  logger.info(`Successfully created tag "${tagName}" with id ${tagId}`);
                  // Optionally, update availableTagNames for subsequent items in this run, though not strictly necessary
                  // availableTagNames.push(tagName); 
                }
              }

              if (tagId) {
                tagIdsToLink.push(tagId);
              }
            }

            if (tagIdsToLink.length > 0) {
              const assetTagsToInsert = tagIdsToLink.map(tagId => ({
                asset_id: dbItem.id,
                tag_id: tagId,
              }));
              const { error: assetTagsError } = await serviceClient.from('asset_tags').insert(assetTagsToInsert);
              if (assetTagsError) {
                logger.error(`Error linking tags to asset ${dbItem.id}:`, assetTagsError.message);
              } else {
                logger.info(`Successfully linked ${tagIdsToLink.length} tags to asset ${dbItem.id}`);
              }
            }
          }

          // Link Room (Create if not exist)
          if (aiItem.room_name) {
            let roomId: string | null = null;

            // Check if room exists
            const { data: existingRoom, error: fetchRoomError } = await serviceClient
              .from('rooms')
              .select('id')
              .eq('user_id', user_id)
              .eq('name', aiItem.room_name)
              .single();

            if (fetchRoomError && fetchRoomError.code !== 'PGRST116') { // PGRST116: 'No rows found'
              logger.warn(`Error fetching room "${aiItem.room_name}": ${fetchRoomError.message}`);
            } else if (existingRoom) {
              roomId = existingRoom.id;
            } else {
              // Room does not exist, create it
              logger.info(`Room "${aiItem.room_name}" not found for user. Creating it.`);
              const { data: newRoom, error: createRoomError } = await serviceClient
                .from('rooms')
                .insert({ user_id: user_id, name: aiItem.room_name })
                .select('id')
                .single();
              
              if (createRoomError) {
                logger.error(`Error creating room "${aiItem.room_name}": ${createRoomError.message}`);
              } else if (newRoom) {
                roomId = newRoom.id;
                logger.info(`Successfully created room "${aiItem.room_name}" with id ${roomId}`);
                // Optionally, update availableRoomNames for subsequent items in this run
                // availableRoomNames.push(aiItem.room_name);
              }
            }

            if (roomId) {
              const { error: assetRoomError } = await serviceClient
                .from('asset_rooms')
                .upsert({ asset_id: dbItem.id, room_id: roomId }, { onConflict: 'asset_id' });

              if (assetRoomError) {
                logger.error(`Error linking room to asset ${dbItem.id}:`, assetRoomError.message);
              } else {
                logger.info(`Successfully linked room ${aiItem.room_name} to asset ${dbItem.id}`);
              }
            }
          }
        }
      }
      // --- End Link Tags and Rooms ---


      const { error: updateError } = await serviceClient
        .from('assets')
        .update({ is_processed: true, last_updated: new Date().toISOString() })
        .eq('id', asset.id);

      if (updateError) {
        return handleError(new Error(`Failed to update asset processed status: ${updateError.message}`), 500);
      }

      const shouldDeleteScratchItems = process.env.DELETE_SCRATCH_ITEMS_AFTER_MERGE === 'true';
      if (shouldDeleteScratchItems && formattedScratchItems.length > 0) {
        // ... (deletion logic remains the same)
        logger.info(`DELETE_SCRATCH_ITEMS_AFTER_MERGE is set to true, deleting ${formattedScratchItems.length} scratch items`);
        const { error: deleteError } = await serviceClient
          .from('scratch_items')
          .delete()
          .eq('user_id', user_id)
          .eq('mux_asset_id', asset.mux_asset_id); // Ensure we only delete for the correct asset

        if (deleteError) {
          logger.error('Error deleting scratch items after merge:', deleteError);
        } else {
          logger.info(`Successfully deleted ${formattedScratchItems.length} scratch items after merge for mux_asset_id ${asset.mux_asset_id}`);
        }
      } else {
        logger.info(`Keeping scratch items after merge (DELETE_SCRATCH_ITEMS_AFTER_MERGE=${process.env.DELETE_SCRATCH_ITEMS_AFTER_MERGE}) or no scratch items to delete.`);
      }

      return corsJsonResponse({
        success: true,
        items: insertedItems?.map(item => ({ ...item, tag_names: analyzedItems.find(ai => ai.name === item.name)?.tag_names, room_name: analyzedItems.find(ai => ai.name === item.name)?.room_name })) || [],
        message: 'Successfully merged transcript with scratch items and processed tags/rooms.',
      });
    } catch (error: unknown) {
      return handleError(error);
    }
  } catch (error: unknown) {
    return handleError(error);
  }
}