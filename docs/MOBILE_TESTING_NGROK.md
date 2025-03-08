# Mobile Testing with ngrok

This guide explains how to test your Padlox application on a mobile device using ngrok, which is especially useful when developing on public WiFi networks with client isolation.

## Prerequisites

- [ngrok](https://ngrok.com/) installed on your development machine
- Your Next.js application running locally
- A mobile device with internet access

## Setup Process

### 1. Start Your Next.js Development Server

First, ensure your Next.js application is running with the proper configuration:

```bash
# update the dev script in package.json to include --hostname 0.0.0.0
"dev": "next dev --turbopack --hostname 0.0.0.0",
```

This command uses the configured script in package.json that includes `--hostname 0.0.0.0` to make the server accessible on all network interfaces.

### 2. Start ngrok

In a separate terminal window, start ngrok to create a secure tunnel to your local server:

```bash
ngrok http 3000
```

This will display a URL like `https://62a4-67-243-247-14.ngrok-free.app` that you can use to access your application from anywhere.

### 3. Update Supabase Redirect URLs

When using authentication (especially magic links), you need to configure Supabase:

1. Go to the [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to Authentication → URL Configuration
4. Add your ngrok URL to the "Redirect URLs" list:
   ```
   https://your-ngrok-url.ngrok-free.app/**
   ```
5. Save your changes

### 4. Update Your Environment Variables

Update your `.env.local` file to use the ngrok URL:

```
NEXT_PUBLIC_SITE_URL="https://your-ngrok-url.ngrok-free.app"

# Comment out or remove the localhost version:
# NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

### 5. Restart Your Development Server

Stop and restart your Next.js development server to apply the environment variable changes:

```bash
# Press Ctrl+C to stop the server, then
pnpm dev
```

### 6. Access on Mobile Device

1. Open a browser on your mobile device
2. Navigate to the ngrok URL shown in your terminal
3. You should now be able to access and test your application

## Troubleshooting

### Magic Links Not Working

If authentication with magic links fails:
- Double-check that Supabase redirect URLs are properly configured
- Ensure your environment variables are using the correct ngrok URL
- Make sure you've restarted your Next.js server after changing environment variables

### Slow Performance

ngrok free tier has bandwidth limitations. If you experience slow performance:
- Consider upgrading to a paid ngrok plan for better performance
- Use reduced image/video quality during testing

### Connection Issues on Public WiFi

Some public WiFi networks block or limit certain types of connections:
- Try using a mobile hotspot instead
- Some coffee shops/public venues might block certain ports

## Best Practices

1. Always update your ngrok URL in the environment variables when it changes (ngrok free tier generates a new URL each session)
2. Remember to switch back to localhost settings when you're done testing
3. For frequent mobile testing, consider setting up scripts to automate the configuration process

## Security Considerations

- ngrok exposes your local development server to the internet
- Never use production API keys, secrets, or sensitive data during ngrok testing
- Consider using ngrok's authentication features for additional security 