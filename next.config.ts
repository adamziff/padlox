import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Remove the hardcoded S3 entry
      // {
      //   protocol: 'https',
      //   hostname: 'padlox-media.s3.us-east-2.amazonaws.com',
      //   port: '',
      //   pathname: '/**',
      // },
      {
        protocol: 'https',
        // Construct hostname from env vars
        hostname: `${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com`,
        port: '', // Explicitly empty port
        pathname: '/**', // Add the missing pathname
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

  // No need for webpack configuration when using Turbopack

  // Experimental features for Turbopack
  experimental: {
    // Configure Turbopack as needed
    // Most features will work without explicit configuration
    esmExternals: true, // For better ESM compatibility
  }
};

export default nextConfig;