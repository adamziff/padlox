/**
 * Temporal worker that can execute our workflow
 */

import { Worker } from '@temporalio/worker';
import * as helloActivities from './activities/hello-activity';
import * as frameAnalysisActivities from './activities/analyze-frame-activity';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from the parent Next.js project
// This needs to happen before any activities are executed
const envPath = path.resolve(process.cwd(), '../.env.local');
dotenv.config({ path: envPath });
console.log(`Loading environment variables from: ${envPath}`);
console.log('Supabase URL configured:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Yes' : 'No');
console.log('Supabase service key configured:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Yes' : 'No');

// Register the namespace and worker
async function run() {
  console.log('Starting Padlox Temporal worker...');
  
  try {
    // Create the worker
    const worker = await Worker.create({
      // Use a more reliable path resolution
      workflowsPath: path.resolve(__dirname, 'workflows'),
      activities: {
        ...helloActivities,
        ...frameAnalysisActivities
      },
      taskQueue: 'padlox-task-queue',
    });

    // Start listening to the task queue
    console.log('Worker connected, listening to task queue: padlox-task-queue');
    await worker.run();
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Worker shutting down...');
  process.exit(0);
}); 