/**
 * Script to run the frame analysis workflow with proper environment loading
 * 
 * This script loads environment variables from .env.local file in the parent
 * directory before running the frame analysis workflow.
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
    execSync('npm run build', { stdio: 'inherit' });
    console.log('TypeScript build successful');
} catch (error) {
    console.error('Failed to build TypeScript:', error);
    process.exit(1);
}

// Run the frame analysis workflow with the loaded environment
console.log('Running frame analysis workflow...');
const args = process.argv.slice(2); // Get any command line arguments
const runProcess = spawn('node', ['lib/run-frame-analysis.js', ...args], {
    stdio: 'inherit',
    env: process.env
});

runProcess.on('error', (error) => {
    console.error('Failed to run workflow:', error);
    process.exit(1);
});

runProcess.on('exit', (code) => {
    process.exit(code || 0);
}); 