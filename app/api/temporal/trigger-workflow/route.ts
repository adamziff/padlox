import { NextResponse } from 'next/server';
import { startHelloWorkflow } from '@/temporal/src/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name = 'User', workflowType = 'helloVideoWorkflow' } = body;
    
    // Generate a unique workflowId
    const workflowId = `${workflowType}-${Date.now()}`;
    console.log(`Starting Temporal workflow: ${workflowType}, ID: ${workflowId}`);
    
    // Start the workflow and handle its completion asynchronously
    startHelloWorkflow(name)
      .then(result => {
        console.log(`Workflow ${workflowId} completed successfully with result: "${result}"`);
      })
      .catch(error => {
        console.error(`Workflow ${workflowId} failed:`, error);
      });
    
    // Return immediately with acknowledgment
    return NextResponse.json({ 
      success: true, 
      message: 'Workflow started',
      workflowId
    });
  } catch (error) {
    console.error('Error triggering workflow:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to trigger workflow',
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
} 