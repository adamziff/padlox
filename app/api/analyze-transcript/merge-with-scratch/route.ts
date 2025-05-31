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

const ItemSchema = z.object({
  name: z.string().min(2),
  description: z.string(),
  estimated_value: z.number().positive(),
  timestamp: z.number().min(0),
  tag_names: z.array(z.string()).optional(),
  room_name: z.string().min(1),
});

const OutputSchema = z.object({
  items: z.array(ItemSchema),
});

export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, asset_id, mux_asset_id, transcript } = body;

    if (!user_id || !(asset_id || mux_asset_id)) {
      return corsErrorResponse('Missing required fields: user_id and either asset_id or mux_asset_id', 400);
    }

    const serviceClient = createServiceSupabaseClient();

    // Get the asset
    let assetQuery = serviceClient.from('assets').select('*').eq('user_id', user_id);
    if (asset_id) {
      assetQuery = assetQuery.eq('id', asset_id);
    } else {
      assetQuery = assetQuery.eq('mux_asset_id', mux_asset_id);
    }

    const { data: asset, error: assetError } = await assetQuery.single();
    if (assetError || !asset) {
      return corsErrorResponse(`Asset not found: ${assetError?.message}`, 404);
    }

    // Get scratch items
    const { data: scratchItems, error: scratchError } = await serviceClient
      .from('scratch_items')
      .select('*')
      .eq('user_id', user_id)
      .eq('mux_asset_id', asset.mux_asset_id);

    if (scratchError) {
      logger.warn('Error fetching scratch items:', scratchError);
    }

    // Get user's existing tags and rooms
    const [tagsResult, roomsResult] = await Promise.all([
      serviceClient.from('tags').select('name').eq('user_id', user_id),
      serviceClient.from('rooms').select('name').eq('user_id', user_id)
    ]);

    const availableTagNames = tagsResult.data?.map(t => t.name) || [];
    const availableRoomNames = roomsResult.data?.map(r => r.name) || [];

    // Create the simplified prompt
    const prompt = createMergePrompt(transcript, scratchItems || [], availableTagNames, availableRoomNames);

    // Generate items using AI
    const model = getAiModel();
    const result = await generateObject({
      model: model,
      schema: OutputSchema,
      prompt,
      mode: 'json'
    });

    const analyzedItems = result.object.items || [];
    logger.info(`Generated ${analyzedItems.length} consolidated items`);

    // Insert items into assets table
    const itemsToInsert = analyzedItems.map(item => ({
      name: item.name,
      description: item.description,
      user_id: user_id,
      mux_asset_id: asset.mux_asset_id,
      item_timestamp: Math.round(item.timestamp * 10) / 10,
      estimated_value: item.estimated_value,
      media_type: 'item' as const,
      media_url: '',
      is_source_video: false,
      source_video_id: asset.id,
      mux_playback_id: asset.mux_playback_id,
    }));

    const { data: insertedItems, error: insertError } = await serviceClient
      .from('assets')
      .insert(itemsToInsert)
      .select('id, name, estimated_value');

    if (insertError) {
      logger.error('Insert error:', insertError);
      return corsErrorResponse(`Failed to insert items: ${insertError.message}`, 500);
    }

    // Link tags and rooms
    if (insertedItems && insertedItems.length > 0) {
      await linkTagsAndRooms(serviceClient, user_id, insertedItems, analyzedItems);
    }

    // Mark asset as processed
    await serviceClient
      .from('assets')
      .update({ is_processed: true, last_updated: new Date().toISOString() })
      .eq('id', asset.id);

    // Clean up scratch items if configured
    if (process.env.DELETE_SCRATCH_ITEMS_AFTER_MERGE === 'true' && scratchItems?.length) {
      await serviceClient
        .from('scratch_items')
        .delete()
        .eq('user_id', user_id)
        .eq('mux_asset_id', asset.mux_asset_id);
      logger.info(`Deleted ${scratchItems.length} scratch items after merge`);
    }

    return corsJsonResponse({
      success: true,
      items: insertedItems,
      message: `Successfully created ${insertedItems.length} inventory items`,
    });

  } catch (error: unknown) {
    logger.error('Error processing merge request:', error);
    return corsErrorResponse(
      error instanceof Error ? error.message : 'Failed to merge transcript with scratch items',
      500
    );
  }
}

function createMergePrompt(
  transcript: unknown, 
  scratchItems: any[], 
  availableTagNames: string[], 
  availableRoomNames: string[]
): string {
  const transcriptText = transcript ? 
    (typeof transcript === 'string' ? transcript : JSON.stringify(transcript)) : 
    'No transcript available';

  const formattedScratchItems = scratchItems.map(item => ({
    name: item.name,
    description: item.description || '',
    timestamp: Number(item.video_timestamp) || 0,
    estimated_value: Number(item.estimated_value) || 0
  }));

  return `You are creating a home inventory for insurance purposes. Your goal is to identify and consolidate high-value items like furniture, electronics, art, jewelry, appliances, etc. that are essential for insurance claims.

TRANSCRIPT: ${transcriptText}

DETECTED ITEMS:
${formattedScratchItems.map(item => 
  `- ${item.name}: ${item.description} (${item.timestamp}s, $${item.estimated_value})`
).join('\n')}

AVAILABLE TAGS (ONLY USE THESE): ${availableTagNames.join(', ') || 'None'}
AVAILABLE ROOMS: ${availableRoomNames.join(', ') || 'None'}

CRITICAL RULES:
1. **TRANSCRIPT ROOM PARSING**: CAREFULLY read the transcript for room mentions (e.g., "this is my bedroom", "in the kitchen", "living room", etc.). When a room is mentioned, assign ALL items detected AFTER that timestamp to that room, until another room is mentioned. If no room is mentioned, use your best judgment to assign a room. BUT IF THE TRANSCRIPT MENTIONS A ROOM, YOU MUST USE THAT ROOM, EVEN IF IT IS ILLOGICAL. ALWAYS ASSIGN A ROOM.

2. **HOME INVENTORY FOCUS**: ONLY include items valuable for insurance claims:
   INCLUDE: Electronics, furniture, appliances, art, jewelry, tools, sporting goods, musical instruments, collectibles, clothing (expensive), books (valuable collections), home decor
   EXCLUDE: Food, consumables, office supplies, toiletries, cleaning products, plants, temporary items

3. **AGGRESSIVE DEDUPLICATION**: Multiple detections of the same item at close timestamps (within 10 seconds) must be merged into ONE entry

4. **CLEAR NAMING**: Use specific, descriptive names (e.g., "Apple MacBook Pro" not "Laptop")

5. **SMART MERGING**: Items like "Mini MIDI Keyboard", "Akai MPK Mini", "Small MIDI Keyboard" are the SAME item

6. **VALUE PRIORITY**: Use transcript values first, then best scratch item value, then estimate intelligently

7. **TAG RESTRICTION**: ONLY use tags from the "AVAILABLE TAGS" list above. Do not create new tags.

8. **MANDATORY ROOM ASSIGNMENT**: You MUST assign a room_name to EVERY single item. Use transcript context if it exists; otherwise, use logical defaults, but only if the transcript does not mention a room.

**ROOM ASSIGNMENT IS MANDATORY - NEVER LEAVE room_name EMPTY, NULL, OR UNDEFINED**

DEFAULT ROOM ASSIGNMENTS IF NO TRANSCRIPT CONTEXT:
- Electronics (laptops, monitors, phones) → "Office"
- Art, wall decor, frames → "Living Room" 
- Furniture, chairs, tables → "Living Room"
- Beds, mattresses, pillows → "Bedroom"
- Kitchen items → "Kitchen"
- Tools, equipment → "Garage"

EXAMPLE OUTPUT (NOTICE EVERY ITEM HAS A ROOM):
{
  "items": [
    {
      "name": "Dell Laptop Computer",
      "description": "Silver Dell laptop used for work and projects",
      "estimated_value": 800,
      "timestamp": 20.0,
      "tag_names": ["Electronics"],
      "room_name": "Office"
    },
    {
      "name": "Black Computer Monitor",
      "description": "Large black computer monitor for desktop setup",
      "estimated_value": 150,
      "timestamp": 20.0,
      "tag_names": ["Electronics"],
      "room_name": "Bedroom"
    }
  ]
}

THOROUGH DEDUPLICATION:
- There ARE items in the scratch_items table that are at different timestamps and have slightly different names and descriptions but are the same item. You MUST merge them into one item. Be aggressive about merging items with similar timestamps.
- You should not return two of the same item unless the user clearly mentions two of the same item in the transcript.
- DO NOT RETURN DUPLICATE ITEMS.

STEP-BY-STEP PROCESS:
1. Read transcript carefully for room mentions and timestamps
2. Filter out food and non-inventory items
3. Deduplicate similar items
4. Assign rooms based on transcript context + logical defaults
5. Ensure EVERY item has a room_name field populated

CRITICAL: Every item in your response MUST have a "room_name" field with a value from the available rooms list. NO EXCEPTIONS.`;
}

async function linkTagsAndRooms(
  serviceClient: any,
  user_id: string,
  insertedItems: any[],
  analyzedItems: any[]
) {
  for (let i = 0; i < insertedItems.length; i++) {
    const dbItem = insertedItems[i];
    const aiItem = analyzedItems[i];

    // Debug logging
    logger.info(`Processing item ${i + 1}: ${dbItem.name}`);
    logger.info(`AI suggested tags: ${JSON.stringify(aiItem.tag_names)}`);
    logger.info(`AI suggested room: ${aiItem.room_name}`);

    // Handle tags - ONLY use existing tags, don't create new ones
    if (aiItem.tag_names?.length) {
      const tagIds: string[] = [];
      
      for (const tagName of aiItem.tag_names) {
        const { data: existingTag } = await serviceClient
          .from('tags')
          .select('id')
          .eq('user_id', user_id)
          .eq('name', tagName)
          .single();

        // Only add if tag exists - don't create new tags
        if (existingTag?.id) {
          tagIds.push(existingTag.id);
          logger.info(`Found existing tag: ${tagName} (${existingTag.id})`);
        } else {
          logger.warn(`Tag not found: ${tagName} - skipping`);
        }
      }

      if (tagIds.length > 0) {
        await serviceClient
          .from('asset_tags')
          .insert(tagIds.map(tag_id => ({ asset_id: dbItem.id, tag_id })));
        logger.info(`Linked ${tagIds.length} tags to asset ${dbItem.id}`);
      }
    }

    // Handle room assignment with fallbacks
    let roomNameToUse = aiItem.room_name;

    if (roomNameToUse) {
      logger.info(`Looking for room: ${roomNameToUse}`);
      let { data: existingRoom } = await serviceClient
        .from('rooms')
        .select('id')
        .eq('user_id', user_id)
        .eq('name', roomNameToUse)
        .single();

      if (!existingRoom) {
        logger.info(`Room not found, creating: ${roomNameToUse}`);
        const { data: newRoom } = await serviceClient
          .from('rooms')
          .insert({ user_id, name: roomNameToUse })
          .select('id')
          .single();
        existingRoom = newRoom;
      } else {
        logger.info(`Found existing room: ${roomNameToUse} (${existingRoom.id})`);
      }

      if (existingRoom?.id) {
        await serviceClient
          .from('asset_rooms')
          .upsert({ asset_id: dbItem.id, room_id: existingRoom.id });
        logger.info(`Linked room ${roomNameToUse} to asset ${dbItem.id}`);
      } else {
        logger.error(`Failed to create or find room: ${roomNameToUse}`);
      }
    } else {
      logger.error(`No room could be determined for item: ${dbItem.name}`);
    }
  }
}