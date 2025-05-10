/**
 * Script to run the frame analysis workflow for testing
 */

import { startFrameAnalysisWorkflow } from './client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });

// Default test values for the image URL
const DEFAULT_IMAGE_URL = 'https://i.pinimg.com/originals/e1/bd/2c/e1bd2c5945a38c1b7b8d1740f9b02412.jpg';

async function run() {
  try {
    // Get image URL from command line or use default
    const imageUrl = process.argv[2] || DEFAULT_IMAGE_URL;
    
    console.log('Running frame analysis workflow with:');
    console.log('- imageUrl:', imageUrl);
    
    // Start the workflow and wait for result
    // We no longer need to pass an assetId
    const scratchItemIds = await startFrameAnalysisWorkflow(imageUrl);
    
    console.log('Frame analysis complete!');
    console.log('- Scratch item IDs:', scratchItemIds);
    
    process.exit(0);
  } catch (error) {
    console.error('Error running frame analysis workflow:', error);
    process.exit(1);
  }
}

run(); 