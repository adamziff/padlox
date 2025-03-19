# Mux Integration for Video Storage and Playback

This document describes how the Padlox application integrates with Mux for video storage and playback.

## Features

- **Secure Video Storage**: Videos captured by users are securely stored on Mux's platform.
- **JWT Authentication**: Videos are protected via JWT tokens that are tied to the user's identity.
- **Asynchronous Processing**: When a user captures a video, it immediately starts uploading to Mux in the background.
- **Progress Indication**: Users can see the processing status of their videos.
- **HLS Streaming**: Videos are streamed using HLS for adaptive bitrate playback.
- **Custom Player**: The application uses Mux Player React component for an optimized viewing experience.

## Implementation Details

### Video Upload Flow

1. User captures a video using the camera.
2. Video is immediately uploaded to Mux using Direct Upload.
3. A pending asset is created in the Supabase database with status "preparing".
4. The user is returned to the dashboard showing a "Video analysis in progress..." card.
5. Once Mux completes processing, a webhook notifies our API.
6. The asset in the database is updated with the ready status and metadata.
7. The video becomes playable in the dashboard.

### Security

- Videos are protected using signed JWT tokens.
- Each token is tied to a specific user's ID.
- Tokens expire after one hour.
- Only the owner of a video can view it.

### API Endpoints

- `/api/mux/upload`: Creates a direct upload URL and initiates the process.
- `/api/mux/token`: Generates a JWT token for secure playback.
- `/api/mux/webhook`: Receives and processes webhook notifications from Mux.

## Configuration

Ensure the following environment variables are set:

```
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
```

## Webhook Setup

To receive webhooks from Mux, configure a webhook endpoint in your Mux dashboard pointing to:

```
https://your-domain.com/api/mux/webhook
```

Make sure to enable the following events:
- `video.asset.ready`
- `video.asset.errored` 

## Local Development with Webhooks

When developing locally, webhooks from Mux won't be able to reach your localhost server directly. Follow these steps to set up webhook functionality during local development:

### Step 1: Install ngrok

If you haven't already, install ngrok:

```bash
# Using Homebrew (macOS)
brew install ngrok

# Or download from https://ngrok.com/download
```

### Step 2: Start your Next.js application

```bash
pnpm run dev
```

### Step 3: Start ngrok to create a tunnel to your local server

```bash
ngrok http 3000
```

This will display a URL like `https://abc123-xyz.ngrok-free.app` that forwards to your local server.

### Step 4: Update your environment variables

Update your `.env.local` file to use the ngrok URL:

```
NEXT_PUBLIC_SITE_URL=https://your-ngrok-url.ngrok-free.app
```

### Step 5: Configure webhook URL in Mux dashboard

1. Log in to your Mux dashboard
2. Go to Settings > Webhooks
3. Add a new webhook or edit an existing one
4. Set the URL to: `https://your-ngrok-url.ngrok-free.app/api/mux/webhook`
5. Make sure to include the full path `/api/mux/webhook`
6. Select the events you want to receive (`video.asset.ready`, `video.asset.errored`, etc.)

### Step 6: Test the webhook

1. Make sure your local server is running
2. Make a test upload to Mux
3. Check your server logs for messages like "Received webhook from Mux"
4. Verify that the webhook data is being properly processed

### Troubleshooting

If webhooks aren't working:

1. **Check the URL configuration**: Ensure the full path `/api/mux/webhook` is appended to your ngrok URL
2. **Verify ngrok is running**: The tunnel must remain active for webhooks to be received
3. **Test the endpoint**: Use `curl -i https://your-ngrok-url.ngrok-free.app/api/mux/webhook` to verify the endpoint is accessible
4. **Check server logs**: Look for any errors in your server logs related to webhook processing
5. **Verify Supabase tables**: Ensure the `webhook_events` table exists in your Supabase instance
6. **Check environment variables**: Ensure `MUX_TOKEN_SECRET` is properly set for signature verification

Note that with each new ngrok session, you'll get a new URL and will need to update both your environment variables and the Mux dashboard webhook configuration. 