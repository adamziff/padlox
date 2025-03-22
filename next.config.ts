import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'padlox-media.s3.us-east-2.amazonaws.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_AWS_BUCKET_NAME + '.s3.' + process.env.NEXT_PUBLIC_AWS_REGION + '.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'image.mux.com',
        pathname: '/**',
      },
    ],
  },
  // Moved from experimental to root level config as per Next.js 15
  serverExternalPackages: ['sharp', 'c2pa-node'],

  // Add minimal headers for camera functionality
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // Using the most permissive feature policy for camera/mic
            key: 'Feature-Policy',
            value: 'camera *; microphone *; autoplay *'
          },
          {
            // Modern syntax for Permissions Policy
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), autoplay=*'
          },
          {
            // Make sure we have cross-origin isolation set properly
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless'
          },
          {
            // Set proper referrer policy for security
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  },

  // No need for webpack configuration when using Turbopack

  // Experimental features for Turbopack
  experimental: {
    // Configure Turbopack as needed
    // Most features will work without explicit configuration
    esmExternals: true, // For better ESM compatibility
  }
};

export default nextConfig;