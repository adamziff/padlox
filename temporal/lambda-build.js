const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Build TypeScript files
console.log('Building TypeScript...');
execSync('pnpm build', { stdio: 'inherit' });

// Prepare the Lambda deployment package
console.log('Preparing Lambda deployment package...');

// Create or clean dist directory
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
    console.log('Cleaning existing dist directory...');
    execSync(`rm -rf "${distDir}/*"`, { stdio: 'inherit' });
} else {
    fs.mkdirSync(distDir, { recursive: true });
}

// Copy the lib folder to dist
console.log('Copying compiled files to dist...');
const libDir = path.join(__dirname, 'lib');
if (fs.existsSync(libDir)) {
    execSync(`cp -r "${libDir}/"* "${distDir}/"`, { stdio: 'inherit' });
} else {
    console.error('Error: lib directory does not exist. Build may have failed.');
    process.exit(1);
}

// Create package.json for Lambda
console.log('Creating Lambda package.json...');
const packageJson = require('./package.json');
const lambdaPackageJson = {
    name: packageJson.name + '-lambda',
    version: packageJson.version,
    description: 'Lambda function for Temporal workflows',
    dependencies: {
        '@ai-sdk/google': packageJson.dependencies['@ai-sdk/google'],
        '@supabase/supabase-js': packageJson.dependencies['@supabase/supabase-js'],
        '@temporalio/activity': packageJson.dependencies['@temporalio/activity'],
        '@temporalio/client': packageJson.dependencies['@temporalio/client'],
        '@temporalio/worker': packageJson.dependencies['@temporalio/worker'],
        '@temporalio/workflow': packageJson.dependencies['@temporalio/workflow'],
        'ai': packageJson.dependencies['ai'],
        'dotenv': packageJson.dependencies['dotenv'],
        'zod': packageJson.dependencies['zod']
    }
};

fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(lambdaPackageJson, null, 2)
);

// Create zip file for Lambda deployment
console.log('Creating Lambda zip file...');
// Use __dirname for reliable paths with spaces
const zipCommand = `cd "${distDir}" && zip -r "${path.join(__dirname, 'lambda-deploy.zip')}" .`;
execSync(zipCommand, { stdio: 'inherit' });

console.log('Lambda deployment package created: lambda-deploy.zip'); 