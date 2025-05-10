/**
 * Temporal worker that can execute our workflow
 */

import { Worker } from '@temporalio/worker';
import * as activities from './activities/hello-activity';
import * as path from 'path';

// Register the namespace and worker
async function run() {
  console.log('Starting Padlox Temporal worker...');
  
  try {
    // Create the worker
    const worker = await Worker.create({
      // Use a more reliable path resolution
      workflowsPath: path.resolve(__dirname, 'workflows'),
      activities,
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