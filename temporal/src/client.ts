/**
 * Temporal client for starting workflows
 */

import { Client, Connection } from '@temporalio/client';

// Create a client connected to the Temporal server
export async function createClient(): Promise<Client> {
  const connection = await Connection.connect({
    address: 'localhost:7233', // Default Temporal server address
  });
  
  return new Client({
    connection,
    namespace: 'default',
  });
}

// Helper function to start the hello workflow
export async function startHelloWorkflow(name: string): Promise<string> {
  const client = await createClient();
  
  // Generate a unique ID for this workflow
  const workflowId = `hello-video-workflow-${Date.now()}`;
  
  try {
    console.log(`Starting workflow with ID: ${workflowId}`);
    
    // Start the workflow execution
    const handle = await client.workflow.start('helloVideoWorkflow', {
      args: [name],
      taskQueue: 'padlox-task-queue',
      workflowId,
    });
    
    console.log(`Started workflow with ID: ${workflowId}`);
    
    // Wait for the workflow to complete and return the result
    const result = await handle.result();
    console.log(`Workflow completed with result: ${result}`);
    
    return result;
  } catch (error) {
    console.error('Error starting workflow:', error);
    throw error;
  }
} 