# Deploying Temporal Workflows to AWS Lambda

This guide provides step-by-step instructions for deploying the Padlox Temporal workflow (specifically the frame analysis workflow) to AWS Lambda for scalable, serverless execution.

## Prerequisites

- AWS Account with appropriate permissions to create Lambda functions, IAM roles, etc.
- AWS CLI installed and configured with credentials
- Node.js and pnpm installed
- Temporal Cloud account (or self-hosted Temporal server)
- Supabase project with configured credentials

## 1. Prepare Your Project

### 1.1 Clean Project Structure

Ensure your Temporal project has a clean structure:

```
temporal/
├── src/
│   ├── activities/
│   │   └── analyze-frame-activity.ts  # Main activity implementation
│   ├── workflows/
│   │   └── analyze-frame-workflow.ts  # Main workflow implementation
│   ├── client.ts                      # Temporal client implementation
│   └── worker.ts                      # Worker implementation
├── package.json
├── tsconfig.json
└── lambda.ts                          # Lambda entry-point (to be created)
```

### 1.2 Install Required Dependencies

```bash
cd temporal
pnpm add @aws-sdk/client-lambda aws-lambda @types/aws-lambda --save
```

## 2. Create Lambda Entry Points

### 2.1 Create Lambda Handler

Create a new file `temporal/src/lambda-handlers.ts`:

```typescript
import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { startFrameAnalysisWorkflow } from './client';

// Handler for triggering the analyze frame workflow
export async function analyzeFrameHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { imageUrl } = body;
    
    if (!imageUrl) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required parameter: imageUrl' })
      };
    }
    
    // Start the workflow
    const workflowId = `analyze-frame-${Date.now()}`;
    console.log(`Starting Temporal frame analysis workflow: ${workflowId}, imageUrl: ${imageUrl}`);
    
    // Since Lambda functions should be short-lived, start the workflow
    // and return immediately without waiting for completion
    startFrameAnalysisWorkflow(imageUrl)
      .then(itemIds => {
        console.log(`Workflow ${workflowId} completed successfully with ${itemIds.length} items`);
      })
      .catch(error => {
        console.error(`Workflow ${workflowId} failed:`, error);
      });
    
    // Return success response
    return {
      statusCode: 202, // Accepted
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Frame analysis workflow started',
        workflowId
      })
    };
  } catch (error) {
    console.error('Error in Lambda handler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: (error as Error).message || 'Unknown error'
      })
    };
  }
}

// Additional worker handler is needed for AWS Lambda
// This handles the execution of workflows and activities
export async function workerHandler(
  event: any,
  context: Context
): Promise<any> {
  // Import worker dynamically to prevent server-side loading issues
  const { createWorker } = await import('./worker-lambda');
  
  try {
    // Start a worker that connects to Temporal
    const worker = await createWorker();
    
    // Wait for worker shutdown or timeout
    await Promise.race([
      worker.run(),
      new Promise(resolve => setTimeout(resolve, context.getRemainingTimeInMillis() - 1000))
    ]);
    
    return { status: 'success' };
  } catch (error) {
    console.error('Error starting worker:', error);
    return { 
      status: 'error',
      message: (error as Error).message 
    };
  }
}
```

### 2.2 Create Lambda Worker

Create a new file `temporal/src/worker-lambda.ts`:

```typescript
import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities/analyze-frame-activity';
import path from 'path';

// Create worker for Lambda environment
export async function createWorker() {
  // Use environment variables for configuration
  const temporalAddress = process.env.TEMPORAL_ADDRESS!;
  const temporalNamespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const temporalTaskQueue = process.env.TEMPORAL_TASK_QUEUE || 'padlox-task-queue';
  
  // Create connection to Temporal
  const connection = await NativeConnection.connect({
    address: temporalAddress,
    tls: {
      // For Temporal Cloud
      serverNameOverride: process.env.TEMPORAL_SERVER_NAME_OVERRIDE,
      serverRootCACertificate: process.env.TEMPORAL_SERVER_ROOT_CA_CERT 
        ? Buffer.from(process.env.TEMPORAL_SERVER_ROOT_CA_CERT, 'base64')
        : undefined,
      clientCertificate: process.env.TEMPORAL_CLIENT_CERT 
        ? Buffer.from(process.env.TEMPORAL_CLIENT_CERT, 'base64')
        : undefined,
      clientPrivateKey: process.env.TEMPORAL_CLIENT_KEY 
        ? Buffer.from(process.env.TEMPORAL_CLIENT_KEY, 'base64')
        : undefined,
    }
  });
  
  // Create the worker
  const worker = await Worker.create({
    connection,
    namespace: temporalNamespace,
    taskQueue: temporalTaskQueue,
    workflowsPath: path.join(__dirname, 'workflows'),
    activities,
    // Keep worker lightweight for Lambda
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 10,
  });
  
  return worker;
}
```

## 3. Configure Build Process for Lambda

### 3.1 Create Lambda Build Script

Create a file `temporal/lambda-build.js`:

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Build TypeScript files
console.log('Building TypeScript...');
execSync('pnpm build', { stdio: 'inherit' });

// Prepare the Lambda deployment package
console.log('Preparing Lambda deployment package...');

// Create dist directory
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Copy the lib folder to dist
execSync('cp -r lib/* dist/', { stdio: 'inherit' });

// Create package.json for Lambda
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
execSync(`cd ${distDir} && zip -r ../lambda-deploy.zip .`, { stdio: 'inherit' });

console.log('Lambda deployment package created: lambda-deploy.zip');
```

### 3.2 Update package.json with Lambda Scripts

Add the following to your `temporal/package.json`:

```json
"scripts": {
  "lambda:build": "node lambda-build.js",
  "lambda:deploy": "pnpm lambda:build && aws lambda update-function-code --function-name padlox-frame-analysis --zip-file fileb://lambda-deploy.zip"
}
```

## 4. Set Up AWS Infrastructure

### 4.1 Create IAM Role for Lambda

Create an IAM policy file `lambda-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

Create the IAM role and policy using the AWS CLI:

```bash
# Create role
aws iam create-role \
  --role-name padlox-temporal-lambda-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

# Create policy
aws iam create-policy \
  --policy-name padlox-temporal-lambda-policy \
  --policy-document file://lambda-policy.json

# Attach policy to role
aws iam attach-role-policy \
  --role-name padlox-temporal-lambda-role \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/padlox-temporal-lambda-policy
```

### 4.2 Create Lambda Functions

Create Lambda functions for workflow trigger and worker:

```bash
# Build the deployment package
cd temporal
pnpm lambda:build

# Create workflow trigger function
aws lambda create-function \
  --function-name padlox-frame-analysis \
  --zip-file fileb://lambda-deploy.zip \
  --handler lambda-handlers.analyzeFrameHandler \
  --runtime nodejs20.x \
  --role arn:aws:iam::ACCOUNT_ID:role/padlox-temporal-lambda-role \
  --timeout 30 \
  --memory-size 256 \
  --environment "Variables={TEMPORAL_ADDRESS=TEMPORAL_CLOUD_ADDRESS,TEMPORAL_NAMESPACE=NAMESPACE,TEMPORAL_TASK_QUEUE=padlox-task-queue,NEXT_PUBLIC_SUPABASE_URL=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_KEY,GOOGLE_GENERATIVE_AI_API_KEY=GEMINI_API_KEY,TEMPORAL_SERVER_NAME_OVERRIDE=OVERRIDE,TEMPORAL_SERVER_ROOT_CA_CERT=CA_CERT,TEMPORAL_CLIENT_CERT=CLIENT_CERT,TEMPORAL_CLIENT_KEY=CLIENT_KEY}"

# Create worker function
aws lambda create-function \
  --function-name padlox-temporal-worker \
  --zip-file fileb://lambda-deploy.zip \
  --handler lambda-handlers.workerHandler \
  --runtime nodejs20.x \
  --role arn:aws:iam::ACCOUNT_ID:role/padlox-temporal-lambda-role \
  --timeout 900 \
  --memory-size 512 \
  --environment "Variables={TEMPORAL_ADDRESS=TEMPORAL_CLOUD_ADDRESS,TEMPORAL_NAMESPACE=NAMESPACE,TEMPORAL_TASK_QUEUE=padlox-task-queue,NEXT_PUBLIC_SUPABASE_URL=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_KEY,GOOGLE_GENERATIVE_AI_API_KEY=GEMINI_API_KEY,TEMPORAL_SERVER_NAME_OVERRIDE=OVERRIDE,TEMPORAL_SERVER_ROOT_CA_CERT=CA_CERT,TEMPORAL_CLIENT_CERT=CLIENT_CERT,TEMPORAL_CLIENT_KEY=CLIENT_KEY}"
```

### 4.3 Create API Gateway for Workflow Trigger

Create a REST API and connect it to the Lambda function:

```bash
# Create API
aws apigateway create-rest-api \
  --name padlox-temporal-api \
  --description "API for Padlox Temporal workflows"

# Get the API ID
API_ID=$(aws apigateway get-rest-apis --query "items[?name=='padlox-temporal-api'].id" --output text)

# Get the root resource ID
ROOT_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query "items[?path=='/'].id" --output text)

# Create resource for frame analysis
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part "analyze-frame"

# Get the resource ID
RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query "items[?path=='/analyze-frame'].id" --output text)

# Create POST method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE

# Set Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:REGION:ACCOUNT_ID:function:padlox-frame-analysis/invocations

# Deploy the API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod
```

### 4.4 Set Up Worker Invocation

Configure an EventBridge rule to trigger the worker Lambda periodically:

```bash
# Create CloudWatch Events rule
aws events put-rule \
  --name padlox-temporal-worker-scheduler \
  --schedule-expression "rate(5 minutes)" \
  --state ENABLED

# Set Lambda as target
aws events put-targets \
  --rule padlox-temporal-worker-scheduler \
  --targets '{"Id": "1", "Arn": "arn:aws:lambda:REGION:ACCOUNT_ID:function:padlox-temporal-worker"}'

# Grant permission for EventBridge to invoke Lambda
aws lambda add-permission \
  --function-name padlox-temporal-worker \
  --statement-id padlox-temporal-worker-scheduler \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:REGION:ACCOUNT_ID:rule/padlox-temporal-worker-scheduler
```

## 5. Update Frontend to Use Lambda API

Update your Next.js application to call the Lambda API endpoint instead of the local Temporal service.

### 5.1 Update API URL in the Environment

In your `.env.local` or `.env.production` file:

```bash
NEXT_PUBLIC_TEMPORAL_API_URL=https://API_ID.execute-api.REGION.amazonaws.com/prod
```

### 5.2 Update the API Client

Update `utils/temporal-client.ts`:

```typescript
/**
 * Client for triggering Temporal workflows via AWS Lambda
 */

export async function triggerFrameAnalysis(imageUrl: string): Promise<{ workflowId: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_TEMPORAL_API_URL || '/api/temporal';
  
  try {
    console.log(`Triggering frame analysis for image: ${imageUrl}`);
    
    const response = await fetch(`${apiUrl}/analyze-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to trigger workflow: ${response.status} ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`Frame analysis workflow triggered: ${result.workflowId}`);
    
    return { workflowId: result.workflowId };
  } catch (error) {
    console.error('Error triggering frame analysis:', error);
    throw error;
  }
}
```

## 6. Deploy and Test

### 6.1 Deploy to AWS

```bash
cd temporal
pnpm lambda:deploy
```

### 6.2 Test the Lambda Function

Test the function manually:

```bash
aws lambda invoke \
  --function-name padlox-frame-analysis \
  --payload '{"body": "{\"imageUrl\":\"https://i.pinimg.com/originals/e1/bd/2c/e1bd2c5945a38c1b7b8d1740f9b02412.jpg\"}"}' \
  output.json

cat output.json
```

### 6.3 Test with a Real Image

Use Postman or curl to send a request to your API Gateway endpoint:

```bash
curl -X POST \
  https://API_ID.execute-api.REGION.amazonaws.com/prod/analyze-frame \
  -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://i.pinimg.com/originals/e1/bd/2c/e1bd2c5945a38c1b7b8d1740f9b02412.jpg"}'
```

## 7. Monitoring and Troubleshooting

### 7.1 View Lambda Logs

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/padlox-frame-analysis \
  --start-time $(date -d '1 hour ago' +%s000) \
  --query 'events[*].message' \
  --output text
```

### 7.2 Set Up CloudWatch Alarms

Create alarms for Lambda errors:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name padlox-frame-analysis-errors \
  --alarm-description "Alarm for Padlox frame analysis Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --dimensions Name=FunctionName,Value=padlox-frame-analysis \
  --alarm-actions arn:aws:sns:REGION:ACCOUNT_ID:your-sns-topic
```

## 8. Security Considerations

- Store API keys and secrets in AWS Secrets Manager instead of environment variables for production
- Set up appropriate IAM policies with least privilege
- Configure VPC access if needed for enhanced security
- Implement proper authentication for your API Gateway
- Set up CORS configuration if the API is called from a browser

## 9. Scaling and Optimization

- Adjust memory and timeout settings based on workload
- Configure provisioned concurrency for Lambda functions with consistent load
- Set up appropriate retry and error handling in your workflow
- Consider AWS Lambda Layers for common dependencies
- Optimize worker polling intervals based on your workload

## Conclusion

Your Temporal workflow for frame analysis is now deployed to AWS Lambda. This setup provides:

- Serverless execution that scales automatically
- Cost efficiency (pay only for what you use)
- Integration with AWS services for monitoring and management
- High availability across multiple AWS availability zones

Remember to monitor your workflows and Lambda functions regularly. As your application evolves, you may need to update your deployment configuration to match your scaling needs. 