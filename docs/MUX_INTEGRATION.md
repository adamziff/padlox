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