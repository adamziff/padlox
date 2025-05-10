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