import { createClient } from '@/utils/supabase/server';
// Import the service role client for privileged operations
import { createServiceSupabaseClient } from '@/lib/auth/supabase';
import { z } from 'zod';
import { generateObject } from 'ai';
import { Database } from '@/lib/db/schema';
import { getAiModel } from '@/lib/ai/config';
import { corsJsonResponse, corsErrorResponse } from '@/lib/api/response';
import { extractParagraphText } from '@/lib/deepgram';
import { TranscriptData } from '@/types/mux';
import { withAuth } from '@/lib/api/auth';

// Define the Zod schema for expected LLM output
const ItemSchema = z.object({
  name: z.string().describe('The name of the identified item, formatted in Title Case.'),
  timestamp: z.number().nonnegative().describe('The start time (in seconds) marking the earliest moment the item is first clearly shown or initially mentioned.'),
  estimated_value: z.number().nullable().describe('An estimated value of the item in USD. MUST be provided (guess if necessary, null if impossible).'),
  description: z.string().describe('A concise description of the item based on the transcript context.')
});

const ItemsListSchema = z.object({
  items: z.array(ItemSchema).describe('An array of items found in the transcript.'),
});

export const POST = withAuth(async (request: Request) => {
  let sourceVideoAssetId: string;
  let transcriptData: TranscriptData;

  try {
    const body = await request.json();
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

    // Use the standard client for initial read/check - auth context here is 'system'
    const userClient = await createClient();

    const { data: sourceAsset, error: sourceAssetError } = await userClient
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
        // Prepare detailed transcript data for the prompt
        const wordsWithTimestamps = transcriptData.results.channels[0]?.alternatives[0]?.words || [];
        const detailedTranscriptContext = JSON.stringify(wordsWithTimestamps.map(w => ({ w: w.punctuated_word || w.word, s: w.start, e: w.end })));

        const result = await generateObject({
          model: model,
          schema: ItemsListSchema,
          prompt: `Analyze the following video transcript data of a home inventory recording. Identify distinct physical items mentioned or described.
For each item:
1. Provide its name, formatted in **Title Case**.
2. Provide the timestamp (in seconds) marking the **earliest moment** the item is first clearly shown or initially mentioned. Use the start time ('s') of the relevant word(s) from the detailed data below.
3. Provide an estimated value in USD (as a number). **You MUST provide an estimate for every item**, even if the user doesn't state a value. Use the context to make a reasonable guess. If no context is available, estimate as null.
4. Provide a concise, one-sentence description of the item based on the context in which it was mentioned.

Output *only* a valid JSON object strictly matching the required schema, with no additional text, commentary, or formatting before or after the JSON object.

Detailed Transcript Data (word, start time, end time):
---
${detailedTranscriptContext}
---

Respond ONLY with the valid JSON object.`,
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

    // Use the SERVICE ROLE CLIENT for database writes (insert/update)
    const serviceClient = createServiceSupabaseClient();

    if (identifiedItems.length === 0) {
      console.log(`[Analyze API] No items identified in transcript for asset ${sourceVideoAssetId}.`);
      // Update using service client
      await serviceClient 
        .from('assets')
        .update({ is_source_video: true })
        .eq('id', sourceVideoAssetId);
      return corsJsonResponse({ success: true, message: 'Analysis complete, no items identified.', itemsCreated: 0 });
    }

    console.log(`[Analyze API] Creating ${identifiedItems.length} item assets for source video ${sourceVideoAssetId}`);

    const itemsToInsert: Database['public']['Tables']['assets']['Insert'][] = identifiedItems.map(item => {
      // Basic Title Case formatting (can be improved with a utility)
      const titleCaseName = item.name
        .trim()
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .substring(0, 255);

      return {
        user_id: sourceAsset.user_id,
        name: titleCaseName || 'Unnamed Item',
        description: item.description,
        media_type: 'item',
        media_url: '',
        is_source_video: false,
        source_video_id: sourceVideoAssetId,
        item_timestamp: item.timestamp,
        mux_playback_id: sourceAsset.mux_playback_id,
        mux_asset_id: sourceAsset.mux_asset_id,
        estimated_value: item.estimated_value
      };
    });

    // Insert using service client
    const { data: insertedItems, error: insertError } = await serviceClient
      .from('assets')
      .insert(itemsToInsert)
      .select('id, name');

    if (insertError) {
      console.error(`[Analyze API] Error inserting items for source ${sourceVideoAssetId}:`, insertError);
      return corsErrorResponse('Failed to save identified items to database', 500, { details: insertError.message });
    }

    console.log(`[Analyze API] Successfully inserted ${insertedItems?.length ?? 0} items.`);

    // Update source video using service client - Mark as source AND set transcript status
    const { error: updateError } = await serviceClient
      .from('assets')
      .update({ 
        is_source_video: true, 
        transcript_processing_status: 'completed',
        is_processed: true
      })
      .eq('id', sourceVideoAssetId);

    if (updateError) {
      // Log the error but don't fail the request, as items were already inserted
      console.error(`[Analyze API] Error updating source video asset ${sourceVideoAssetId} status after item insertion:`, updateError);
    }

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
});

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
