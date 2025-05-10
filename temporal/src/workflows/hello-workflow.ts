/**
 * A simple workflow that calls the sayHello activity
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/hello-activity';

// Create a proxy to the activities
const { sayHello } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export async function helloVideoWorkflow(name: string): Promise<string> {
  console.log(`[Workflow] Starting helloVideoWorkflow for ${name}`);
  
  // Call the sayHello activity
  const result = await sayHello(name);
  
  console.log(`[Workflow] Workflow completed with result: ${result}`);
  return result;
} 