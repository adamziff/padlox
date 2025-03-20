# Padlox Application Architecture

This document provides an overview of the Padlox application architecture, detailing the core components, data flow, and integration points.

## System Overview

Padlox is a web application for secure video capture, storage, and playback. The application allows users to securely record videos and view them with cryptographic verification that the content has not been tampered with.

### Key Features

- Secure video capture and storage
- JWT-protected video playback
- Video content authentication
- Asynchronous video processing
- Real-time status updates

## Architecture Diagram

```
┌─────────────┐       ┌───────────────┐       ┌────────────┐
│  Next.js    │       │   Supabase    │       │    Mux     │
│  Frontend   │◄─────►│   Backend     │◄─────►│   Video    │
└─────────────┘       └───────────────┘       └────────────┘
       ▲                      ▲                     ▲
       │                      │                     │
       ▼                      │                     │
┌─────────────┐               │                     │
│  Next.js    │               │                     │
│   API       │───────────────┘                     │
│   Routes    │─────────────────────────────────────┘
└─────────────┘
```

## Core Components

### 1. Frontend (Next.js)

- **Framework**: Next.js with App Router
- **UI**: React components with TailwindCSS
- **State Management**: React Context and Hooks
- **Client Authentication**: Supabase Auth
- **Video Player**: Mux Player React component

### 2. Backend

- **Database**: PostgreSQL via Supabase
- **Authentication**: Supabase Auth
- **Storage**: Mux Video for video assets
- **API Layer**: Next.js API Routes
- **Video Processing**: Mux Video processing pipeline

### 3. External Services

- **Mux**: Video storage, processing, and streaming
- **Supabase**: Database, authentication, and realtime subscriptions
- **AWS**: C2PA signing via KMS

## Data Flow

### Video Upload Flow

1. User captures video via the camera component
2. Frontend initiates a direct upload URL request to the backend
3. Backend creates a direct upload URL via Mux API
4. Frontend uploads video directly to Mux using the direct upload URL
5. Backend creates a pending asset record in the database
6. Mux processes the video and sends a webhook notification when complete
7. Webhook handler updates the asset status in the database
8. Frontend receives real-time updates via Supabase realtime subscriptions

### Playback Flow

1. User requests to view a video
2. Frontend requests a signed JWT token from the backend
3. Backend generates a signed JWT with the user's ID and video's playback ID
4. Frontend uses the token to securely play the video via Mux Player

## API Routes

- `/api/mux/upload`: Creates a direct upload URL for new videos
- `/api/mux/token`: Generates JWT tokens for secure video playback
- `/api/mux/webhook`: Receives and processes webhook notifications from Mux

## Database Schema

### Key Tables

- `assets`: Stores video metadata and processing status
- `webhook_events`: Records webhook events for processing and auditing
- `users`: User accounts and profiles

## Authentication and Security

- **User Authentication**: Supabase Auth with email/password and social providers
- **Video Security**: Videos are protected via signed JWT tokens
- **API Security**: 
  - Environment-specific API keys
  - Webhook signature verification
  - CORS protection

## Content Authentication

- Videos are cryptographically signed using C2PA (Coalition for Content Provenance and Authenticity)
- Signing uses AWS KMS for secure key management
- Signed content can be verified for authenticity and non-tampering

## Environment Configuration

The application supports multiple environments:

- **Development**: Local development with ngrok for webhook testing
- **Production**: Production deployment with full security measures

## Deployment

- **Hosting**: Vercel for Next.js application
- **Database**: Supabase hosted PostgreSQL
- **Video Infrastructure**: Mux Video platform

## Monitoring and Logging

- Application-level logging for critical operations
- Webhook event storage for audit and retry capabilities
- Error tracking for failed operations

## Future Considerations

- Implementing queue-based processing for webhook events
- Enhanced analytics for video engagement
- Multi-region deployment for improved performance

## Related Documentation

- [Mux Integration](./MUX_INTEGRATION.md): Details about Mux integration
- [C2PA Signing](./C2PA_SIGNING.md): Details about content authentication 