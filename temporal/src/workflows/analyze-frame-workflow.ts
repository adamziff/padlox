/**
 * A workflow for analyzing video frames with Gemini 1.5 Flash
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/analyze-frame-activity';

// Frame analysis input parameters
export interface AnalyzeFrameInput {
  imageUrl: string;         // URL of the frame image to analyze
}

// Create a proxy to the activities with retry policy
const { 
  analyzeFrameWithGemini, 
  storeAllScratchItems
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '10s',
    backoffCoefficient: 2,
    maximumInterval: '2m',
    nonRetryableErrorTypes: ['TypeError', 'RangeError'] 
  },
});

/**
 * Workflow to analyze a frame using Gemini and store results
 */
export interface AnalyzeFrameOutput {
  itemIds: string[]; // Array of scratch item IDs created
  message: string;   // Completion message
}

/**
 * Workflow to analyze a video frame with Gemini and store the results
 * 
 * @param input Object containing imageUrl
 * @returns Object with item IDs and completion message
 */
export async function analyzeFrame(input: AnalyzeFrameInput): Promise<AnalyzeFrameOutput> {
  let status = 'Starting analysis';

  try {
    // Step 1: Analyze the image
    status = `Analyzing image: ${input.imageUrl}`;
    console.log(`[Workflow] ${status}`);
    const analysisResult = await analyzeFrameWithGemini(input.imageUrl);

    // Step 2: Store all items in the database
    status = `Storing ${analysisResult.items.length} items from analysis`;
    console.log(`[Workflow] ${status}`);
    const itemIds = await storeAllScratchItems(input.imageUrl, analysisResult.items);
    console.log(`[Workflow] Stored ${itemIds.length} items from frame analysis`);
    
    // Return the result
    status = 'Workflow completed successfully';
    console.log(`[Workflow] ${status}`);
    return {
      itemIds,
      message: 'Frame analysis completed successfully and items stored.'
    };

  } catch (error) {
    status = `Workflow failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[Workflow] Error: ${status}`);
    // Re-throw the error to let Temporal handle retries/failures based on policy
    throw error; 
  }
} 