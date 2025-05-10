import { NextResponse } from 'next/server';
import { startFrameAnalysisWorkflow } from '@/temporal/src/client';

interface AnalyzeFrameRequest {
  assetId: string;
  imageUrl: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AnalyzeFrameRequest;
    const { assetId, imageUrl } = body;
    
    // Validate required parameters
    if (!assetId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameter: assetId' },
        { status: 400 }
      );
    }
    
    if (!imageUrl) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameter: imageUrl' },
        { status: 400 }
      );
    }
    
    // Generate a unique workflowId
    const workflowId = `analyze-frame-${assetId}-${Date.now()}`;
    console.log(`Starting Temporal frame analysis workflow for asset: ${assetId}, ID: ${workflowId}`);
    
    // Start the workflow and handle its completion asynchronously
    startFrameAnalysisWorkflow(assetId, imageUrl)
      .then(itemIds => {
        console.log(`Frame analysis workflow ${workflowId} completed successfully with ${itemIds.length} items identified`);
      })
      .catch(error => {
        console.error(`Frame analysis workflow ${workflowId} failed:`, error);
      });
    
    // Return immediately with acknowledgment
    return NextResponse.json({ 
      success: true, 
      message: 'Frame analysis workflow started',
      workflowId
    });
  } catch (error) {
    console.error('Error triggering frame analysis workflow:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to trigger frame analysis workflow',
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
} 