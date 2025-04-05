import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { DEFAULT_MODEL, AI_MODELS } from '@/lib/llm';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/db/schema';
import { getAiModel } from '@/lib/ai/config';
import { corsJsonResponse, corsErrorResponse } from '@/lib/api/response';
import { extractParagraphText } from '@/lib/deepgram';
import { TranscriptData } from '@/types/mux';
import { getMuxThumbnailUrl } from '@/lib/mux';

// Define the Zod schema for expected LLM output
const ItemSchema = z.object({
  name: z.string().describe('The name of the identified item.'),
  timestamp: z.number().nonnegative().describe('The start time (in seconds) when the item first clearly appears in the video.'),
  estimated_value: z.number().nullable().describe('An estimated value of the item in USD, or null if unknown.')
});

const ItemsListSchema = z.object({
  items: z.array(ItemSchema).describe('An array of items found in the transcript.'),
});

type ItemAnalysis = z.infer<typeof ItemsListSchema>;

async function createItemAssets(
  items: ItemAnalysis['items'],
  videoAssetId: string,
  supabase: SupabaseClient<Database>
) {
  const { data: sourceVideo, error: sourceVideoError } = await supabase
    .from('assets')
    .select('mux_playback_id')
    .eq('id', videoAssetId)
    .single();

  if (sourceVideoError || !sourceVideo?.mux_playback_id) {
    throw new Error('Source video not found or missing playback ID');
  }

  const insertPromises = items.map((item) => ({
    name: item.name,
    description: '',
    estimated_value: null,
    is_source_video: false,
    source_video_id: videoAssetId,
    timestamp_start: item.timestamp,
    timestamp_end: item.timestamp,
    thumbnail_timestamp: item.timestamp,
    mux_playback_id: sourceVideo.mux_playback_id
  }));

  const { error: insertError } = await supabase
    .from('assets')
    .insert(insertPromises);

  if (insertError) {
    throw new Error(`Failed to create item assets: ${insertError.message}`);
  }
}

export async function POST(req: Request) {
  let sourceVideoAssetId: string;
  let transcriptData: TranscriptData;

  try {
    const body = await req.json();
    if (!body.videoAssetId || !body.transcript) {
      return corsErrorResponse('Missing videoAssetId or transcript in request body', 400);
    }
    sourceVideoAssetId = body.videoAssetId;
    // Basic validation for transcript structure
    if (!body.transcript?.results?.channels?.[0]?.alternatives?.[0]) {
      return corsErrorResponse('Invalid transcript structure', 400);
    }
    transcriptData = body.transcript as TranscriptData;

    const transcriptText = extractParagraphText(transcriptData) || transcriptData.results.channels[0].alternatives[0].transcript || '';

    if (!transcriptText) {
      console.warn(`[Analyze API] Could not extract text from transcript for asset: ${sourceVideoAssetId}`);
    }

    console.log(`[Analyze API] Received request for asset: ${sourceVideoAssetId}, transcript length: ${transcriptText.length}`);

    const supabase = createServiceSupabaseClient();

    const { data: sourceAsset, error: sourceAssetError } = await supabase
      .from('assets')
      .select('id, user_id, mux_playback_id, mux_asset_id')
      .eq('id', sourceVideoAssetId)
      .single();

    if (sourceAssetError || !sourceAsset) {
      console.error(`[Analyze API] Error fetching source asset ${sourceVideoAssetId}:`, sourceAssetError);
      return corsErrorResponse('Source video asset not found or error fetching it', 404);
    }

    if (!sourceAsset.mux_playback_id) {
      console.error(`[Analyze API] Source asset ${sourceVideoAssetId} missing mux_playback_id`);
      return corsErrorResponse('Source video is missing necessary playback information', 400);
    }

    console.log(`[Analyze API] Found source asset: ${sourceAsset.id}, user: ${sourceAsset.user_id}, playbackId: ${sourceAsset.mux_playback_id}, muxAssetId: ${sourceAsset.mux_asset_id}`);

    const model = getAiModel();
    let analysisResult: z.infer<typeof ItemsListSchema> | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !analysisResult) {
      attempts++;
      console.log(`[Analyze API] Attempt ${attempts} to analyze transcript for asset ${sourceVideoAssetId}`);
      try {
        const result = await generateObject({
          model: model,
          schema: ItemsListSchema,
          prompt: `Analyze the following video transcript of a home inventory recording. Identify distinct physical items mentioned or described. For each item, provide its name, the timestamp (in seconds) when it first clearly appears or is mentioned, and an estimated value in USD (as a number, or null if unknown). Output *only* a valid JSON object strictly matching the required schema, with no additional text, commentary, or formatting before or after the JSON object.\n\nTranscript:\n---\n${transcriptText}\n---\n\nRespond ONLY with the valid JSON object.`,
          mode: 'json'
        });

        analysisResult = result.object;
        console.log(`[Analyze API] Attempt ${attempts} successful. Found ${analysisResult.items.length} items.`);
      } catch (error) {
        console.error(`[Analyze API] Attempt ${attempts} failed:`, error);
        if (attempts >= maxAttempts) {
          throw new Error(`LLM analysis failed after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!analysisResult) {
      console.error('[Analyze API] Failed to get valid analysis after retries.');
      return corsErrorResponse('Failed to analyze transcript after multiple attempts', 500);
    }

    const identifiedItems = analysisResult.items;

    if (identifiedItems.length === 0) {
      console.log(`[Analyze API] No items identified in transcript for asset ${sourceVideoAssetId}.`);
      await supabase
        .from('assets')
        .update({ is_source_video: true })
        .eq('id', sourceVideoAssetId);
      return corsJsonResponse({ success: true, message: 'Analysis complete, no items identified.', itemsCreated: 0 });
    }

    console.log(`[Analyze API] Creating ${identifiedItems.length} item assets for source video ${sourceVideoAssetId}`);

    const itemsToInsert: Database['public']['Tables']['assets']['Insert'][] = identifiedItems.map(item => {
      // Do NOT generate the full thumbnail URL here. Store components needed by client.
      // const thumbnailUrl = getMuxThumbnailUrl(sourceAsset.mux_playback_id!, item.timestamp);
      const itemName = item.name.trim().substring(0, 255);

      return {
        user_id: sourceAsset.user_id,
        name: itemName || 'Unnamed Item',
        media_type: 'item',
        media_url: '', // Store empty string or null, client will construct the signed URL
        is_source_video: false,
        source_video_id: sourceVideoAssetId,
        item_timestamp: item.timestamp,
        mux_playback_id: sourceAsset.mux_playback_id,
        mux_asset_id: sourceAsset.mux_asset_id,
        estimated_value: item.estimated_value
      };
    });

    const { data: insertedItems, error: insertError } = await supabase
      .from('assets')
      .insert(itemsToInsert)
      .select('id, name');

    if (insertError) {
      console.error(`[Analyze API] Error inserting items for source ${sourceVideoAssetId}:`, insertError);
      return corsErrorResponse('Failed to save identified items to database', 500, { details: insertError.message });
    }

    console.log(`[Analyze API] Successfully inserted ${insertedItems?.length ?? 0} items.`);

    await supabase
      .from('assets')
      .update({ is_source_video: true })
      .eq('id', sourceVideoAssetId);

    return corsJsonResponse({
      success: true,
      message: `Analysis complete. ${insertedItems?.length ?? 0} items created.`,
      itemsCreated: insertedItems?.length ?? 0,
      itemIds: insertedItems?.map(item => item.id) || [],
    });
  } catch (error) {
    console.error('[Analyze API] Unexpected error in POST handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return corsErrorResponse(`Server error analyzing transcript: ${errorMessage}`, 500);
  }
}

export async function OPTIONS() {
  const response = new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
  return response;
}
