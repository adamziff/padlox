#!/bin/bash
# AWS CLI commands for deploying Padlox Temporal to Lambda
# These commands are for reference when AWS CLI is installed

# Variables (replace with your values)
ACCOUNT_ID="your-aws-account-id"
REGION="us-east-1"
LAMBDA_ROLE="padlox-temporal-lambda-role"
LAMBDA_POLICY="padlox-temporal-lambda-policy"
TASK_QUEUE="padlox-task-queue"
TEMPORAL_ADDRESS="your-temporal-server-address"
TEMPORAL_NAMESPACE="default"
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
GEMINI_API_KEY="${GOOGLE_GENERATIVE_AI_API_KEY}"

# 1. Create IAM role and policy
echo "Creating IAM role..."
aws iam create-role \
  --role-name $LAMBDA_ROLE \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

echo "Creating IAM policy..."
aws iam create-policy \
  --policy-name $LAMBDA_POLICY \
  --policy-document file://lambda-policy/lambda-policy.json

echo "Attaching policy to role..."
aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE \
  --policy-arn arn:aws:iam::$ACCOUNT_ID:policy/$LAMBDA_POLICY

# 2. Create Lambda function for workflow
echo "Creating workflow trigger Lambda function..."
aws lambda create-function \
  --function-name padlox-frame-analysis \
  --zip-file fileb://lambda-deploy.zip \
  --handler lambda-handlers.analyzeFrameHandler \
  --runtime nodejs20.x \
  --role arn:aws:iam::$ACCOUNT_ID:role/$LAMBDA_ROLE \
  --timeout 30 \
  --memory-size 256 \
  --environment "Variables={TEMPORAL_ADDRESS=$TEMPORAL_ADDRESS,TEMPORAL_NAMESPACE=$TEMPORAL_NAMESPACE,TEMPORAL_TASK_QUEUE=$TASK_QUEUE,NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY,GOOGLE_GENERATIVE_AI_API_KEY=$GEMINI_API_KEY}"

# 3. Create worker Lambda function
echo "Creating worker Lambda function..."
aws lambda create-function \
  --function-name padlox-temporal-worker \
  --zip-file fileb://lambda-deploy.zip \
  --handler lambda-handlers.workerHandler \
  --runtime nodejs20.x \
  --role arn:aws:iam::$ACCOUNT_ID:role/$LAMBDA_ROLE \
  --timeout 900 \
  --memory-size 512 \
  --environment "Variables={TEMPORAL_ADDRESS=$TEMPORAL_ADDRESS,TEMPORAL_NAMESPACE=$TEMPORAL_NAMESPACE,TEMPORAL_TASK_QUEUE=$TASK_QUEUE,NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY,GOOGLE_GENERATIVE_AI_API_KEY=$GEMINI_API_KEY}"

# 4. Create API Gateway
echo "Creating API Gateway..."
API_ID=$(aws apigateway create-rest-api \
  --name padlox-temporal-api \
  --description "API for Padlox Temporal workflows" \
  --query "id" --output text)

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query "items[?path=='/'].id" --output text)

# Create resource
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part "analyze-frame" \
  --query "id" --output text)

# Create method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE

# Set integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:$ACCOUNT_ID:function:padlox-frame-analysis/invocations

# Deploy API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod

# Set permissions for API Gateway to invoke Lambda
aws lambda add-permission \
  --function-name padlox-frame-analysis \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/prod/POST/analyze-frame"

# 5. Set up worker invocation
echo "Setting up EventBridge rule..."
aws events put-rule \
  --name padlox-temporal-worker-scheduler \
  --schedule-expression "rate(5 minutes)" \
  --state ENABLED

# Add target
aws events put-targets \
  --rule padlox-temporal-worker-scheduler \
  --targets "Id"="1","Arn"="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:padlox-temporal-worker"

# Grant permission
aws lambda add-permission \
  --function-name padlox-temporal-worker \
  --statement-id events-invoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:$REGION:$ACCOUNT_ID:rule/padlox-temporal-worker-scheduler"

echo "Deployment complete!"
echo "API Gateway URL: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/analyze-frame" 