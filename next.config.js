/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: process.env.NEXT_PUBLIC_AWS_BUCKET_NAME + '.s3.' + process.env.NEXT_PUBLIC_AWS_REGION + '.amazonaws.com',
            },
        ],
    },
    experimental: {
        serverComponentsExternalPackages: ['sharp', 'c2pa-node'],
    },
    webpack: (config, { isServer }) => {
        if (!isServer) {
            // Don't attempt to resolve these modules on the client
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                child_process: false,
                crypto: false,
                path: false,
                os: false,
            }
        }
        return config
    },
}

module.exports = nextConfig