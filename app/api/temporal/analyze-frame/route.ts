/**
 * API route to trigger a Temporal frame analysis workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { startFrameAnalysisWorkflow } from '@/temporal/src/client';

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const { assetId, imageUrl } = body;
    
    // Validate required parameters
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: imageUrl' },
        { status: 400 }
      );
    }
    
    // Start the workflow
    const workflowId = `analyze-frame-${Date.now()}`;
    console.log(`Starting Temporal frame analysis workflow: ${workflowId}`);
    
    // Start the workflow and return immediately to match the Lambda behavior
    startFrameAnalysisWorkflow(imageUrl)
      .then(itemIds => {
        console.log(`Workflow ${workflowId} completed with ${itemIds.length} items identified`);
      })
      .catch(error => {
        console.error(`Workflow ${workflowId} failed:`, error);
      });
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Frame analysis workflow started',
      workflowId
    }, { status: 202 });
  } catch (error) {
    console.error('Error starting workflow:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Unknown error' },
      { status: 500 }
    );
  }
} 