import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { startFrameAnalysisWorkflow } from './client';

// Handler for triggering the analyze frame workflow
export async function analyzeFrameHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { imageUrl } = body;
    
    if (!imageUrl) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required parameter: imageUrl' })
      };
    }
    
    // Start the workflow
    const workflowId = `analyze-frame-${Date.now()}`;
    console.log(`Starting Temporal frame analysis workflow: ${workflowId}, imageUrl: ${imageUrl}`);
    
    // Since Lambda functions should be short-lived, start the workflow
    // and return immediately without waiting for completion
    startFrameAnalysisWorkflow(imageUrl)
      .then(itemIds => {
        console.log(`Workflow ${workflowId} completed successfully with ${itemIds.length} items`);
      })
      .catch(error => {
        console.error(`Workflow ${workflowId} failed:`, error);
      });
    
    // Return success response
    return {
      statusCode: 202, // Accepted
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Frame analysis workflow started',
        workflowId
      })
    };
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: (error as Error).message || 'Unknown error'
      })
    };
  }
}

// Additional worker handler is needed for AWS Lambda
// This handles the execution of workflows and activities
export async function workerHandler(
  event: any,
  context: Context
): Promise<any> {
  // Import worker dynamically to prevent server-side loading issues
  const { createWorker } = await import('./worker-lambda');
  
  try {
    // Start a worker that connects to Temporal
    const worker = await createWorker();
    
    // Wait for worker shutdown or timeout
    await Promise.race([
      worker.run(),
      new Promise(resolve => setTimeout(resolve, context.getRemainingTimeInMillis() - 1000))
    ]);
    
    return { status: 'success' };
  } catch (error) {
    console.error('Error starting worker:', error);
    return { 
      status: 'error',
      message: (error as Error).message 
    };
  }
} 