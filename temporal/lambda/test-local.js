/**
 * Test script to simulate AWS Lambda execution locally
 * 
 * This script simulates the AWS Lambda environment by calling the Lambda handler 
 * functions directly with mock events and context.
 */

// Import the Lambda handlers
const { analyzeFrameHandler, workerHandler } = require('../lib/lambda-handlers');

// Mock API Gateway event for the analyze-frame endpoint
const mockEvent = {
    body: JSON.stringify({
        imageUrl: 'https://i.pinimg.com/originals/e1/bd/2c/e1bd2c5945a38c1b7b8d1740f9b02412.jpg'
    }),
    headers: {
        'Content-Type': 'application/json'
    },
    httpMethod: 'POST',
    path: '/analyze-frame'
};

// Mock AWS Lambda context
const mockContext = {
    awsRequestId: `test-${Date.now()}`,
    getRemainingTimeInMillis: () => 30000, // 30 seconds
    functionName: 'local-test',
    functionVersion: '$LATEST',
    memoryLimitInMB: '512'
};

// Load environment variables
require('dotenv').config({ path: '../../.env.local' });

// Ensure required environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required environment variables. Check .env.local file.');
    process.exit(1);
}

// Set Temporal environment variables for local testing
process.env.TEMPORAL_ADDRESS = 'localhost:7233';
process.env.TEMPORAL_NAMESPACE = 'default';
process.env.TEMPORAL_TASK_QUEUE = 'padlox-task-queue';

// Test the analyzeFrameHandler
async function testAnalyzeFrameHandler() {
    console.log('-'.repeat(80));
    console.log('Testing analyzeFrameHandler...');
    console.log('-'.repeat(80));

    try {
        const result = await analyzeFrameHandler(mockEvent, mockContext);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error executing analyzeFrameHandler:', error);
    }
}

// Test the workerHandler
async function testWorkerHandler() {
    console.log('-'.repeat(80));
    console.log('Testing workerHandler...');
    console.log('-'.repeat(80));

    try {
        // Worker will run indefinitely, so we'll set a timeout
        const workerPromise = workerHandler({}, mockContext);

        // Set a timeout to stop the worker after 10 seconds
        setTimeout(() => {
            console.log('Stopping worker after timeout');
            process.exit(0);
        }, 10000);

        await workerPromise;
    } catch (error) {
        console.error('Error executing workerHandler:', error);
    }
}

// Run the tests
async function runTests() {
    const testType = process.argv[2] || 'analyze';

    if (testType === 'analyze') {
        await testAnalyzeFrameHandler();
    } else if (testType === 'worker') {
        await testWorkerHandler();
    } else if (testType === 'all') {
        await testAnalyzeFrameHandler();
        await testWorkerHandler();
    } else {
        console.error('Invalid test type. Use: analyze, worker, or all');
    }
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
}); 