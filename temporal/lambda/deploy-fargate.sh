#!/bin/bash
# Script for deploying Temporal to AWS Fargate instead of Lambda
# This may be a better approach if Lambda permissions are restricted

# Variables
ACCOUNT_ID="864981760797"
REGION="us-east-2"
ECR_REPOSITORY="padlox-temporal"
CLUSTER_NAME="padlox-temporal-cluster"
TASK_DEFINITION_NAME="padlox-temporal-task"
SERVICE_NAME="padlox-temporal-service"
TEMPORAL_ADDRESS="localhost:7233" # Update this if using Temporal Cloud
TEMPORAL_NAMESPACE="default"
TASK_QUEUE="padlox-task-queue"

# Load environment variables from .env.local
source ../../.env.local

# Check if ECR repository exists
echo "Checking if ECR repository exists..."
if ! aws ecr describe-repositories --repository-names $ECR_REPOSITORY 2>/dev/null; then
  echo "Creating ECR repository..."
  aws ecr create-repository --repository-name $ECR_REPOSITORY
fi

# Create a Dockerfile
echo "Creating Dockerfile..."
cat > Dockerfile << EOF
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY dist/package.json .
RUN npm install --production

# Copy application code
COPY dist .

# Set environment variables
ENV TEMPORAL_ADDRESS=$TEMPORAL_ADDRESS
ENV TEMPORAL_NAMESPACE=$TEMPORAL_NAMESPACE
ENV TEMPORAL_TASK_QUEUE=$TASK_QUEUE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV GOOGLE_GENERATIVE_AI_API_KEY=$GOOGLE_GENERATIVE_AI_API_KEY

# Run the worker
CMD ["node", "worker.js"]
EOF

# Build and push Docker image
echo "Building and pushing Docker image..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker build -t $ECR_REPOSITORY .
docker tag $ECR_REPOSITORY:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPOSITORY:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPOSITORY:latest

# Create ECS cluster if it doesn't exist
echo "Creating ECS cluster..."
aws ecs create-cluster --cluster-name $CLUSTER_NAME

# Create task definition
echo "Creating task definition..."
cat > task-definition.json << EOF
{
  "family": "$TASK_DEFINITION_NAME",
  "networkMode": "awsvpc",
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "temporal-worker",
      "image": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPOSITORY:latest",
      "essential": true,
      "portMappings": [],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$TASK_DEFINITION_NAME",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "environment": [
        { "name": "TEMPORAL_ADDRESS", "value": "$TEMPORAL_ADDRESS" },
        { "name": "TEMPORAL_NAMESPACE", "value": "$TEMPORAL_NAMESPACE" },
        { "name": "TEMPORAL_TASK_QUEUE", "value": "$TASK_QUEUE" },
        { "name": "NEXT_PUBLIC_SUPABASE_URL", "value": "$NEXT_PUBLIC_SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "value": "$SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "GOOGLE_GENERATIVE_AI_API_KEY", "value": "$GOOGLE_GENERATIVE_AI_API_KEY" }
      ]
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512"
}
EOF

aws ecs register-task-definition --cli-input-json file://task-definition.json

# Create service
echo "Creating ECS service..."
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name $SERVICE_NAME \
  --task-definition $TASK_DEFINITION_NAME \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345678],securityGroups=[sg-12345678],assignPublicIp=ENABLED}"

# Create API Gateway
echo "Creating API Gateway..."
API_ID=$(aws apigateway create-rest-api \
  --name padlox-temporal-api \
  --description "API for Padlox Temporal workflows" \
  --query "id" --output text)

echo "API Gateway created with ID: $API_ID"

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query "items[?path=='/'].id" --output text)

echo "Root resource ID: $ROOT_ID"

# Create resource
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part "analyze-frame" \
  --query "id" --output text)

echo "Resource ID: $RESOURCE_ID"

# Create method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE

# Deploy API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod

echo "Deployment complete!"
echo "API Gateway URL: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/analyze-frame"

# Update .env.local with the API Gateway URL
API_URL="https://$API_ID.execute-api.$REGION.amazonaws.com/prod"
echo "Updating .env.local with API Gateway URL: $API_URL"

# Check if NEXT_PUBLIC_TEMPORAL_API_URL already exists in .env.local
if grep -q "NEXT_PUBLIC_TEMPORAL_API_URL" ../../.env.local; then
  # Replace existing line
  sed -i '' "s|NEXT_PUBLIC_TEMPORAL_API_URL=.*|NEXT_PUBLIC_TEMPORAL_API_URL=$API_URL|" ../../.env.local
else
  # Add new line
  echo "NEXT_PUBLIC_TEMPORAL_API_URL=$API_URL" >> ../../.env.local
fi

echo "Updated .env.local file."
echo "You now need to create the API integration for the API Gateway endpoint."
echo "Please follow the documentation to complete the setup." 