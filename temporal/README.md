# Padlox Temporal Workflow

This directory contains the Temporal workflow for analyzing frames using Gemini AI, which powers the item detection feature in Padlox.

## Architecture

The project is structured as follows:

- **Workflows**: Define the execution logic for analyzing frames and storing results
- **Activities**: Implement the actual work of calling the Gemini API and storing data in Supabase
- **Client**: Provides methods for triggering workflows from the Next.js application
- **Worker**: Runs and executes the workflows and activities

## Prerequisites

- Node.js 18+ and pnpm
- Temporal server running locally or Temporal Cloud account
- Supabase project with configured credentials
- Google AI (Gemini) API key

## Getting Started

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment variables**:
   
   The workflow uses the `.env.local` file from the parent Next.js project. Make sure it contains:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
   ```

3. **Build the project**:
   ```bash
   pnpm build
   ```

4. **Start the worker**:
   ```bash
   pnpm worker:env
   ```
   
## Development Workflow

1. **Start the worker in watch mode**:
   ```bash
   pnpm dev
   ```

2. **Test the frame analysis workflow**:
   ```bash
   pnpm analyze-frame https://example.com/your-image.jpg
   ```

## Production Deployment

For production deployment, see the [AWS Lambda Deployment Guide](../docs/temporal-aws-lambda-deployment.md).

## Core Files

- `src/workflows/analyze-frame-workflow.ts` - The main workflow definition
- `src/activities/analyze-frame-activity.ts` - Activities for AI analysis and data storage
- `src/client.ts` - Client for starting workflows
- `src/worker.ts` - Worker that processes workflow tasks 