#!/bin/bash
# Script for local testing of Lambda handlers

# Make sure dependencies are installed
echo "Installing required dependencies..."
cd ..
pnpm install

# Build the project
echo "Building the project..."
pnpm build

# Set up environment variables from .env.local
echo "Setting up environment variables..."
export $(grep -v '^#' ../.env.local | xargs)

# Set Temporal environment variables for local testing
export TEMPORAL_ADDRESS="localhost:7233"
export TEMPORAL_NAMESPACE="default"
export TEMPORAL_TASK_QUEUE="padlox-task-queue"

# Test local Lambda handlers
echo "Testing Lambda handlers locally..."
pnpm lambda:test

echo "Lambda local testing complete"
echo "To test with worker, run: pnpm lambda:test:worker"

# Add entry to .env.local for local testing
API_URL="http://localhost:3000/api/temporal"
echo "Updating .env.local with local API URL: $API_URL"
if grep -q "NEXT_PUBLIC_TEMPORAL_API_URL" ../.env.local; then
  # Replace existing line
  sed -i '' "s|NEXT_PUBLIC_TEMPORAL_API_URL=.*|NEXT_PUBLIC_TEMPORAL_API_URL=$API_URL|" ../.env.local
else
  # Add new line
  echo "NEXT_PUBLIC_TEMPORAL_API_URL=$API_URL" >> ../.env.local
fi

echo "Updated .env.local file with local API URL."
echo "You can now use the Lambda handlers locally." 