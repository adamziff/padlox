# AWS Lambda Deployment for Padlox Temporal

This directory contains scripts and configuration for deploying the Padlox Temporal workflow to AWS Lambda.

## Prerequisites

Before deploying to AWS Lambda, you need to:

1. Install AWS CLI (https://aws.amazon.com/cli/)
2. Configure AWS credentials (`aws configure`)
3. Ensure you have a Temporal Cloud account or Temporal server
4. Set up necessary environment variables

## Build and Deployment Process

The Lambda deployment package has been built with the command:
```bash
pnpm lambda:build
```

This created a `lambda-deploy.zip` file in the temporal directory.

## Manual AWS Setup Instructions

Since AWS CLI is not installed on your system, follow these manual steps:

1. **Create IAM Role for Lambda**

   - Sign in to the AWS Management Console
   - Go to IAM service
   - Create a new role for Lambda with appropriate permissions
   - Use the policy in `lambda-policy/lambda-policy.json`

2. **Create Lambda Functions**

   - Go to AWS Lambda service
   - Create a new Lambda function named "padlox-frame-analysis"
   - Runtime: Node.js 20.x
   - Upload the `lambda-deploy.zip` file
   - Set the handler to: `lambda-handlers.analyzeFrameHandler`
   - Configure with your IAM role
   - Set environment variables:
     ```
     TEMPORAL_ADDRESS=<your temporal server address>
     TEMPORAL_NAMESPACE=<your namespace>
     TEMPORAL_TASK_QUEUE=padlox-task-queue
     NEXT_PUBLIC_SUPABASE_URL=<your supabase url>
     SUPABASE_SERVICE_ROLE_KEY=<your supabase service key>
     GOOGLE_GENERATIVE_AI_API_KEY=<your gemini api key>
     ```

3. **Create Worker Lambda Function**

   - Create another Lambda function named "padlox-temporal-worker"
   - Use the same zip file and IAM role
   - Set the handler to: `lambda-handlers.workerHandler`
   - Set the same environment variables
   - Set timeout to 15 minutes

4. **Create API Gateway**

   - Create a REST API in API Gateway
   - Create a resource for `/analyze-frame`
   - Create a POST method and integrate with your Lambda function
   - Deploy the API

5. **Set Up Worker Invocation**

   - Create an EventBridge rule to run every 5 minutes
   - Set the Lambda worker as the target

## Update Frontend

Update your application to use the new API Gateway endpoint:

```typescript
// In utils/temporal-client.ts
const apiUrl = process.env.NEXT_PUBLIC_TEMPORAL_API_URL || '/api/temporal';
```

Set `NEXT_PUBLIC_TEMPORAL_API_URL` to your API Gateway URL in `.env.local`.

## Testing

Test your deployment by:

1. Sending a POST request to your API Gateway endpoint
2. Checking CloudWatch logs for both Lambda functions
3. Verifying data is being stored in Supabase

## Troubleshooting

If you encounter issues:

1. Check Lambda CloudWatch logs
2. Verify environment variables are correct
3. Test IAM permissions
4. Ensure Temporal connection is properly configured 