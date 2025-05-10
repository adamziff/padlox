/**
 * Script to start the Temporal worker with proper environment loading
 * 
 * This script loads environment variables from .env.local file in the parent
 * directory before starting the worker.
 */
const path = require('path');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from parent Next.js project
const envPath = path.resolve(__dirname, '../.env.local');
console.log(`Loading environment variables from: ${envPath}`);

if (fs.existsSync(envPath)) {
    // Load the env file content
    const env = dotenv.config({ path: envPath }).parsed || {};

    // Combine with current process.env
    Object.assign(process.env, env);

    console.log('Environment loaded successfully');
    console.log('Supabase URL configured:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Yes' : 'No');
    console.log('Supabase service key configured:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Yes' : 'No');
} else {
    console.error(`Environment file not found: ${envPath}`);
    process.exit(1);
}

// Build the TypeScript files
console.log('Building TypeScript...');
try {
    execSync('pnpm build', { stdio: 'inherit' });
    console.log('TypeScript build successful');
} catch (error) {
    console.error('Failed to build TypeScript:', error);
    process.exit(1);
}

// Start the worker with the loaded environment
console.log('Starting Temporal worker...');
const worker = spawn('node', ['lib/worker.js'], {
    stdio: 'inherit',
    env: process.env
});

worker.on('error', (error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
});

worker.on('exit', (code) => {
    if (code !== 0) {
        console.error(`Worker exited with code ${code}`);
        process.exit(code);
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Stopping worker...');
    worker.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('Stopping worker...');
    worker.kill('SIGTERM');
}); 