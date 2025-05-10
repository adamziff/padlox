'use client';

/**
 * Simple utility for triggering Temporal workflows from the client
 */

/**
 * Triggers a simple hello workflow using Temporal
 * @returns Promise that resolves when the workflow starts
 */
export async function triggerHelloWorkflow(): Promise<void> {
  try {
    console.log('Triggering Temporal hello workflow...');
    const response = await fetch('/api/temporal/trigger-workflow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'User',
        workflowType: 'helloVideoWorkflow',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to trigger workflow');
    }

    const result = await response.json();
    console.log('Workflow triggered successfully:', result);
  } catch (error) {
    console.error('Error triggering workflow:', error);
    throw error;
  }
}

/**
 * Triggers a frame analysis workflow using Temporal
 * @param assetId ID of the asset to analyze
 * @param imageUrl URL of the image to analyze
 * @returns Promise that resolves when the workflow starts
 */
export async function triggerFrameAnalysis(
  assetId: string,
  imageUrl: string
): Promise<{ workflowId: string }> {
  try {
    console.log(`Triggering Temporal frame analysis workflow for asset ${assetId}...`);
    const response = await fetch('/api/temporal/analyze-frame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetId,
        imageUrl,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to trigger frame analysis workflow');
    }

    const result = await response.json();
    console.log('Frame analysis workflow triggered successfully:', result);
    return { workflowId: result.workflowId };
  } catch (error) {
    console.error('Error triggering frame analysis workflow:', error);
    throw error;
  }
} 