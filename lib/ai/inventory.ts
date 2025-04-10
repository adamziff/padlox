// lib/ai/inventory.ts
import { Asset } from '@/types/asset';
import { generateObject, GenerateObjectResult } from 'ai';
import { z } from 'zod';
import { getAiModel } from './config'; // Import the centralized model getter
import { createServiceSupabaseClient } from '@/lib/auth/supabase'; // Import service client creator
import { Database } from '@/lib/db/schema'; // Import generated DB types

// Define the expected structure for each item extracted by the LLM
const ExtractedItemSchema = z.object({
  name: z.string().describe('Concise, descriptive name (e.g., "Sony Bravia 55-inch OLED TV")'),
  description: z.string().optional().describe('Additional details mentioned (e.g., "Model XBR-55A9G, purchased in 2020")'),
  estimated_value: z.number().optional().describe('Estimated monetary value if mentioned'),
  inferred_room_name: z.string().optional().nullable().describe('Inferred room name (e.g., "Kitchen", "Living Room") or null'),
  tags: z.array(z.string()).optional().default([]).describe('List of relevant tag names ONLY from the provided user tag list'),
  timestamp: z.number().describe('Start time (seconds) in transcript where item description begins'),
  purchase_date: z.string().optional().describe('Purchase date if mentioned (attempt YYYY-MM-DD)'),
  condition: z.string().optional().describe('Condition mentioned (e.g., "New", "Used - Good", "Damaged")'),
  serial_number: z.string().optional().describe('Serial number if explicitly stated'),
  brand: z.string().optional().describe('Brand name (e.g., "Samsung", "IKEA")'),
  model: z.string().optional().describe('Model name or number (e.g., "Galaxy S23", "Expedit Shelf")'),
});

// Define the overall expected LLM response structure: an array of items
const InventoryExtractionResponseSchema = z.object({
  items: z.array(ExtractedItemSchema),
});

// Type alias for the *parsed* data structure from the LLM response
export type InventoryData = z.infer<typeof InventoryExtractionResponseSchema>;
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

// LLM Prompt Template Construction
function buildInventoryPrompt(transcript: string, userTags: string[]): string {
  const tagListString = userTags.length > 0 ? userTags.join(', ') : 'No specific tags provided.';

  return `
You are an expert home inventory cataloger analyzing a video transcript. Your task is to meticulously identify every distinct physical item mentioned by the speaker, extract detailed information about each item, infer the room context if possible, and categorize items using ONLY the provided tags.

**Transcript:**
"""
${transcript}
"""

**User's Available Tags:**
[${tagListString}]

**Instructions:**

1.  **Identify Items:** Read through the transcript and identify every distinct physical belonging mentioned.
2.  **Extract Details:** For each item, extract the following information IF mentioned or clearly inferable:
    *   \`name\`: (Required) A concise but descriptive name (e.g., "Sony Bravia 55-inch OLED TV", "Antique Wooden Rocking Chair").
    *   \`description\`: Any additional details (e.g., "Model XBR-55A9G, purchased in 2020", "Small water stain on the seat").
    *   \`estimated_value\`: Estimated monetary value (e.g., "worth about $500", "paid $1200 for it"). Must be a number.
    *   \`inferred_room_name\`: The room the item is likely in based on transcript context (e.g., "Kitchen", "Living Room", "Office"). Return null if unclear.
    *   \`tags\`: Select relevant tags ONLY from the provided "User's Available Tags" list above. Return an empty array \`[]\` if no provided tags are suitable. Do NOT invent tags.
    *   \`timestamp\`: (Required) The start time (in seconds) where the item's description begins in the transcript. Use word timings if available, otherwise estimate.
    *   \`purchase_date\`: Date of purchase. Attempt to format as YYYY-MM-DD (e.g., "last year", "June 2022").
    *   \`condition\`: Condition described (e.g., "brand new", "like new", "good condition", "slightly damaged"). Standardize if possible (e.g., "New", "Used - Like New", "Used - Good", "Used - Fair", "Damaged").
    *   \`serial_number\`: The serial number if explicitly stated.
    *   \`brand\`: Brand name (e.g., "Samsung", "IKEA").
    *   \`model\`: Model name or number (e.g., "Galaxy S23", "Artisan Stand Mixer").
3.  **Format Output:** Return the extracted information as a JSON object containing a single key "items" which is an array. Each element in the array represents one identified item and MUST conform to the structure specified below.
4.  **Accuracy:** Be precise. Only include information explicitly mentioned or strongly implied in the transcript. Do not hallucinate details. Ensure timestamps are accurate. Ensure tags are ONLY from the provided list.

**Required JSON Output Format:**
\`\`\`json
{
  "items": [
    {
      "name": "Example Item Name",
      "description": "Optional details",
      "estimated_value": 150, // number or omit
      "inferred_room_name": "Living Room", // string or null
      "tags": ["Electronics", "Furniture"], // array of strings from provided list, or []
      "timestamp": 15.7, // number (seconds)
      "purchase_date": "2023-05-10", // string YYYY-MM-DD or omit
      "condition": "Used - Good", // string or omit
      "serial_number": "SN12345XYZ", // string or omit
      "brand": "ExampleBrand", // string or omit
      "model": "Model-ABC" // string or omit
    },
    // ... more items
  ]
}
\`\`\`

Analyze the transcript carefully and provide the JSON output.
`;
}

/**
 * Calls the LLM to extract inventory items from a transcript.
 * @param transcript - The plain text transcript.
 * @param userTags - A list of tag names available to the user.
 * @returns A promise that resolves to the structured inventory extraction result.
 */
export async function callLLMForInventoryExtraction(
  transcript: string,
  userTags: string[]
): Promise<InventoryData> {
  // Get the default AI model instance from the config
  const model = getAiModel(); 

  const prompt = buildInventoryPrompt(transcript, userTags);

  console.log('[AI Inventory] Sending prompt to LLM...');
  // Example using Vercel AI SDK's generateObject with Zod schema
  // Replace with your preferred LLM client if not using Vercel AI SDK / OpenAI
  const result = await generateObject({
      model: model, // Use the model instance from config
      schema: InventoryExtractionResponseSchema,
      prompt: prompt,
  });
  console.log('[AI Inventory] Received LLM response.');

  return result.object;
}

// --- Implementation of the main processing function ---
export async function processTranscriptAndSaveItems(
  sourceAssetId: string,
  transcriptText: string,
  userId: string
): Promise<void> {
  console.log(`[AI Inventory] Starting processing for asset ${sourceAssetId}, user ${userId}`);
  const supabaseAdmin = createServiceSupabaseClient(); // Create client instance here

  try {
    // 1. Fetch user tags from Supabase
    console.log(`[AI Inventory] Fetching tags for user ${userId}`);
    const { data: userTagData, error: tagsError } = await supabaseAdmin
      .from('user_tags')
      .select('tags ( id, name )') // Select tag id and name via relationship
      .eq('user_id', userId);

    if (tagsError) {
      console.error('[AI Inventory] Error fetching user tags:', tagsError);
      throw new Error(`Failed to fetch user tags: ${tagsError.message}`);
    }

    const userTagsMap = new Map<string, string>(); // Map name -> id
    const userTagNames: string[] = [];
    if (userTagData) {
        userTagData.forEach(ut => {
            // The structure is { tags: { id: '...', name: '...' } } or { tags: null }
            if (ut.tags && typeof ut.tags === 'object' && 'id' in ut.tags && 'name' in ut.tags) { // Type guard for object
                 // Ensure properties exist and are strings before using them
                 const tagName = String(ut.tags.name);
                 const tagId = String(ut.tags.id);
                 userTagsMap.set(tagName.toLowerCase(), tagId); // Store lowercase for lookup
                 userTagNames.push(tagName);
            }
        });
    }
    console.log(`[AI Inventory] Found ${userTagNames.length} tags for user: ${userTagNames.join(', ')}`);


    // 2. Call callLLMForInventoryExtraction
    const extractionResult = await callLLMForInventoryExtraction(transcriptText, userTagNames);

    // 3. Validate and Parse result.object.items
    if (!extractionResult?.items || !Array.isArray(extractionResult.items)) {
         console.error('[AI Inventory] Invalid or empty items array received from LLM:', extractionResult);
         // Potentially update asset status to indicate an AI processing error
         await supabaseAdmin.from('assets').update({
             processing_status: 'failed', // Assuming you have such a status
             // Add an error description field if available
         }).eq('id', sourceAssetId);
         return; // Stop processing
    }

    const extractedItems: ExtractedItem[] = extractionResult.items;
    console.log(`[AI Inventory] LLM extracted ${extractedItems.length} items.`);

    if (extractedItems.length === 0) {
        console.log(`[AI Inventory] No items extracted by LLM for asset ${sourceAssetId}. Processing complete.`);
        // Optionally update the source asset status if needed
        await supabaseAdmin.from('assets').update({
            is_processed: true, // Mark source video as processed (even if no items found)
            processing_status: 'completed'
        }).eq('id', sourceAssetId);
        return;
    }

    // 4. Loop through items and insert into DB
    const itemsToInsert: Database['public']['Tables']['assets']['Insert'][] = [];
    const itemTagsToInsert: { item_id: string; tag_id: string }[] = []; // Temp store for tags

    for (const item of extractedItems) {
        // Basic validation
        if (!item.name || typeof item.timestamp !== 'number') {
            console.warn('[AI Inventory] Skipping item due to missing name or timestamp:', item);
            continue;
        }

        // a. Prepare new Asset row data
        const newItemAsset: Database['public']['Tables']['assets']['Insert'] = {
            user_id: userId,
            name: item.name,
            description: item.description,
            estimated_value: item.estimated_value,
            media_url: '', // Assign empty string instead of null
            media_type: 'item', // Mark as an item extracted from video
            is_source_video: false,
            source_video_id: sourceAssetId,
            item_timestamp: item.timestamp,
            // New fields from migration
            room_id: null, // Room linking will happen later or via user input/inference refinement
            inferred_room_name: item.inferred_room_name,
            purchase_date: item.purchase_date, // Assuming string format YYYY-MM-DD is acceptable
            purchase_price: null, // Set to null as LLM doesn't provide this
            condition: item.condition,
            serial_number: item.serial_number,
            brand: item.brand,
            model: item.model,
            notes: `Extracted from video asset ${sourceAssetId} at timestamp ${item.timestamp}s.`, // Auto-generated note
            is_processed: true, // Mark this *item* asset as processed by AI
            processing_status: 'completed',
             // Leave media_url, file_*, mux_* fields null/default for items
        };
        itemsToInsert.push(newItemAsset);
        // We'll get the ID after insertion to link tags
    }

     // b. Insert Asset rows into Supabase
     if (itemsToInsert.length > 0) {
        console.log(`[AI Inventory] Inserting ${itemsToInsert.length} new item assets...`);
        const { data: insertedAssets, error: insertAssetsError } = await supabaseAdmin
            .from('assets')
            .insert(itemsToInsert)
            .select('id, name'); // Select id and name to link tags

        if (insertAssetsError || !insertedAssets) {
            console.error('[AI Inventory] Error inserting new item assets:', insertAssetsError);
            // Handle partial failure? Maybe mark source asset as failed?
            throw new Error(`Failed to insert item assets: ${insertAssetsError?.message}`);
        }

        console.log(`[AI Inventory] Successfully inserted ${insertedAssets.length} item assets.`);

        // c & d & e. Prepare and insert item_tags
        const tagInserts: Database['public']['Tables']['item_tags']['Insert'][] = [];
        for (let i = 0; i < insertedAssets.length; i++) {
            const insertedAsset = insertedAssets[i];
            const originalExtractedItem = extractedItems.find(item => item.name === insertedAsset.name); // Simple match by name for now

            if (originalExtractedItem && originalExtractedItem.tags && originalExtractedItem.tags.length > 0) {
                originalExtractedItem.tags.forEach(tagName => {
                    const lowerCaseTagName = tagName.toLowerCase();
                    if (userTagsMap.has(lowerCaseTagName)) {
                        tagInserts.push({
                            item_id: insertedAsset.id,
                            tag_id: userTagsMap.get(lowerCaseTagName)!
                        });
                    } else {
                        console.warn(`[AI Inventory] LLM returned tag "${tagName}" which is not in the user's list or map. Skipping.`);
                    }
                });
            }
        }

        if (tagInserts.length > 0) {
             console.log(`[AI Inventory] Inserting ${tagInserts.length} item tags...`);
             const { error: insertTagsError } = await supabaseAdmin
                .from('item_tags')
                .insert(tagInserts);

             if (insertTagsError) {
                 console.error('[AI Inventory] Error inserting item tags:', insertTagsError);
                 // Decide how to handle: log, mark items as partially failed?
             } else {
                 console.log(`[AI Inventory] Successfully inserted item tags.`);
             }
        }
     } else {
         console.log("[AI Inventory] No valid items to insert after validation.");
     }

    // Update source video asset status (optional, could be done earlier)
    await supabaseAdmin.from('assets').update({
        is_processed: true, // Mark source video as processed
        processing_status: 'completed'
    }).eq('id', sourceAssetId);

    console.log(`[AI Inventory] Successfully processed transcript for asset ${sourceAssetId}`);

  } catch (error) {
    console.error(`[AI Inventory] CRITICAL ERROR processing asset ${sourceAssetId}:`, error);
    // Update source asset status to failed
    try {
        await supabaseAdmin.from('assets').update({
             processing_status: 'failed',
             // Consider storing error message if schema allows
             // transcript_error: error instanceof Error ? error.message : String(error) // Example
        }).eq('id', sourceAssetId);
    } catch (updateError) {
        console.error(`[AI Inventory] Failed to update asset status to failed for ${sourceAssetId}:`, updateError);
    }
  }
}
