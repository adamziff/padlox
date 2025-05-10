/**
 * Simple script to run the workflow for testing
 */

import { startHelloWorkflow } from './client';

async function run() {
  try {
    const result = await startHelloWorkflow('Padlox');
    console.log(`Workflow execution completed with result: ${result}`);
  } catch (error) {
    console.error('Failed to run workflow:', error);
  }
}

// Run the workflow
run().catch((err) => {
  console.error(err);
  process.exit(1);
}); 