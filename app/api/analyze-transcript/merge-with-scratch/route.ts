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
  room_name: z.string().optional(),
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

  return `You are creating a home inventory for insurance purposes. Your goal is to identify and consolidate high-value items like furniture, electronics, art, jewelry, etc. that are essential for insurance claims.

TRANSCRIPT: ${transcriptText}

DETECTED ITEMS:
${formattedScratchItems.map(item => 
  `- ${item.name}: ${item.description} (${item.timestamp}s, $${item.estimated_value})`
).join('\n')}

AVAILABLE TAGS (ONLY USE THESE): ${availableTagNames.join(', ') || 'None'}
AVAILABLE ROOMS: ${availableRoomNames.join(', ') || 'None'}

CONSOLIDATION RULES:
1. **AGGRESSIVE DEDUPLICATION**: Multiple detections of the same item at close timestamps (within 10 seconds) must be merged into ONE entry
2. **INCLUSIVE APPROACH**: Include most legitimate home inventory items worth $50+ - err on the side of inclusion rather than exclusion
3. **CLEAR NAMING**: Use specific, descriptive names (e.g., "Apple MacBook Pro" not "Laptop")
4. **SMART MERGING**: Items like "Mini MIDI Keyboard", "Akai MPK Mini", "Small MIDI Keyboard" are the SAME item
5. **VALUE PRIORITY**: Use transcript values first, then best scratch item value, then estimate intelligently
6. **TAG RESTRICTION**: ONLY use tags from the "AVAILABLE TAGS" list above. Do not create new tags.

EXAMPLE OUTPUT:
{
  "items": [
    {
      "name": "Apple MacBook Pro 16-inch",
      "description": "High-performance laptop computer used for work and creative projects",
      "estimated_value": 2500,
      "timestamp": 5.2,
      "tag_names": ["Electronics"],
      "room_name": "Office"
    },
    {
      "name": "Sony 55-inch 4K TV",
      "description": "Large flat screen television mounted on living room wall",
      "estimated_value": 800,
      "timestamp": 12.5,
      "tag_names": ["Electronics"],
      "room_name": "Living Room"
    },
    {
      "name": "Wooden Coffee Table", 
      "description": "Dark wood coffee table with storage drawers",
      "estimated_value": 400,
      "timestamp": 8.1,
      "tag_names": ["Furniture"],
      "room_name": "Living Room"
    }
  ]
}

Create a comprehensive inventory including most detectable items worth $50+. Be conservative with merging - only merge if absolutely certain it's the same item.`;
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
        }
      }

      if (tagIds.length > 0) {
        await serviceClient
          .from('asset_tags')
          .insert(tagIds.map(tag_id => ({ asset_id: dbItem.id, tag_id })));
      }
    }

    // Handle room - can create new rooms if needed
    if (aiItem.room_name) {
      let { data: existingRoom } = await serviceClient
        .from('rooms')
        .select('id')
        .eq('user_id', user_id)
        .eq('name', aiItem.room_name)
        .single();

      if (!existingRoom) {
        const { data: newRoom } = await serviceClient
          .from('rooms')
          .insert({ user_id, name: aiItem.room_name })
          .select('id')
          .single();
        existingRoom = newRoom;
      }

      if (existingRoom?.id) {
        await serviceClient
          .from('asset_rooms')
          .upsert({ asset_id: dbItem.id, room_id: existingRoom.id });
      }
    }
  }
}