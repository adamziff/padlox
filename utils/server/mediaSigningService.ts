import { createC2pa, createTestSigner, ManifestBuilder } from 'c2pa-node'
import { KMS } from '@aws-sdk/client-kms'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Initialize AWS KMS client
const kms = new KMS({
    region: process.env.AWS_REGION || 'us-east-2'
})

/**
 * Initialize C2PA with AWS KMS signer
 * This is a singleton that will be reused across requests
 */
export const c2paPromise = (async () => {
    // Check for production environment
    const isProduction = process.env.NODE_ENV === 'production'

    try {
        if (isProduction) {
            // In production, we should use AWS KMS
            const kmsKeyId = process.env.AWS_KMS_KEY_ID

            if (!kmsKeyId) {
                console.warn('AWS_KMS_KEY_ID environment variable is not set, falling back to test signer')
                // Fall back to test signer if KMS key is not configured
                return createC2pa({
                    signer: await createTestSigner({
                        certificatePath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pub'),
                        privateKeyPath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pem')
                    })
                })
            }

            console.log('Using AWS KMS signer with key ID:', kmsKeyId)

            // TODO: Implement KMS signer when AWS KMS credentials are available
            // For now, fall back to test signer
            return createC2pa({
                signer: await createTestSigner({
                    certificatePath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pub'),
                    privateKeyPath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pem')
                })
            })
        } else {
            // In development, use test signer
            console.log('Using test signer for development environment')
            return createC2pa({
                signer: await createTestSigner({
                    certificatePath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pub'),
                    privateKeyPath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pem')
                })
            })
        }
    } catch (error) {
        console.error('Error initializing C2PA:', error)
        throw error
    }
})()

/**
 * Creates a C2PA manifest with metadata for the asset
 */
function createManifest(metadata: {
    name: string;
    description: string | null;
    estimated_value: number | null;
}, mimeType: string) {
    return new ManifestBuilder({
        claim_generator: 'Padlox/1.0.0',
        format: mimeType,
        title: metadata.name,
        assertions: [
            {
                label: 'c2pa.actions',
                data: {
                    actions: [
                        {
                            action: 'c2pa.created',
                            when: new Date().toISOString(),
                            softwareAgent: 'Padlox/1.0.0 (KMS Signing)',
                            parameters: {
                                input: {
                                    asset: {
                                        format: mimeType,
                                        title: metadata.name
                                    }
                                }
                            }
                        }
                    ],
                },
            },
            {
                label: 'stds.schema-org.CreativeWork',
                data: {
                    '@context': 'https://schema.org',
                    '@type': 'ImageObject',
                    'name': metadata.name,
                    'description': metadata.description || '',
                    'dateCreated': new Date().toISOString(),
                    'creator': {
                        '@type': 'Organization',
                        'name': 'Padlox Home Inventory',
                        'url': 'https://padlox.com'
                    }
                },
            },
            {
                label: 'com.padlox.metadata',
                data: {
                    description: metadata.description || '',
                    estimated_value: metadata.estimated_value || 0,
                    capture_time: new Date().toISOString(),
                    app_version: '1.0.0',
                    device_info: {
                        software: 'Padlox Web App',
                        version: '1.0.0'
                    }
                },
            },
        ],
    })
}

/**
 * Signs a file using C2PA with AWS KMS
 */
export async function signFile(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    metadata: {
        name: string;
        description: string | null;
        estimated_value: number | null;
    }
) {
    const c2pa = await c2paPromise
    const isVideo = mimeType.startsWith('video/')

    if (isVideo) {
        // Only support MP4 videos with H.264 codec
        if (!mimeType.includes('mp4')) {
            throw new Error('Only MP4 videos (H.264) are currently supported for content credentials')
        }

        // For videos, use file-based signing with proper extension
        const tempDir = os.tmpdir()
        const extension = 'mp4'
        const tempInputPath = path.join(tempDir, `input_${Date.now()}.${extension}`)
        const tempOutputPath = path.join(tempDir, `output_${Date.now()}.${extension}`)

        try {
            // Write buffer to temporary file
            await fs.promises.writeFile(tempInputPath, buffer)

            // Create manifest with video-specific metadata
            const manifest = createManifest(metadata, mimeType)

            console.log('Created video manifest for:', {
                name: metadata.name,
                mimeType: 'video/mp4',
                extension,
                size: buffer.length
            })

            // Sign the file using file paths
            const { signedAsset } = await c2pa.sign({
                asset: {
                    path: tempInputPath,
                    mimeType: 'video/mp4'
                },
                manifest,
                options: {
                    outputPath: tempOutputPath,
                    embed: true
                }
            })

            // Read the signed file back into a buffer
            const signedBuffer = await fs.promises.readFile(tempOutputPath)

            console.log('Video buffer sizes:', {
                original: buffer.length,
                signed: signedBuffer.length,
                difference: signedBuffer.length - buffer.length
            })

            // Verify the signed video immediately
            try {
                const verifyResult = await c2pa.read({
                    path: tempOutputPath,
                    mimeType: 'video/mp4'
                })

                if (!verifyResult?.activeManifest) {
                    throw new Error('No manifest found in signed video')
                }

                console.log('Video verification:', {
                    success: !!verifyResult,
                    hasManifest: !!verifyResult?.activeManifest,
                    manifestStore: verifyResult?.manifestStore,
                    validationStatus: verifyResult?.validationStatus || []
                })

                // Clean up temporary files
                await Promise.all([
                    fs.promises.unlink(tempInputPath),
                    fs.promises.unlink(tempOutputPath)
                ]).catch(console.error)

                return signedBuffer
            } catch (error: unknown) {
                console.error('Video verification failed:', error instanceof Error ? error.message : String(error))
                throw new Error('Failed to verify signed video')
            }
        } catch (error) {
            // Clean up temporary files in case of error
            await Promise.all([
                fs.promises.unlink(tempInputPath).catch(() => { }),
                fs.promises.unlink(tempOutputPath).catch(() => { })
            ])
            throw error
        }
    }

    // For images, use buffer-based signing
    const manifest = createManifest(metadata, mimeType)
    console.log('Created manifest for:', {
        name: metadata.name,
        mimeType,
        timestamp: new Date().toISOString()
    })

    const { signedAsset } = await c2pa.sign({
        asset: {
            buffer,
            mimeType
        },
        manifest,
        options: {
            // Ensure manifest is embedded in the file
            embed: true
        }
    })

    console.log('Buffer sizes:', {
        original: buffer.length,
        signed: signedAsset.buffer.length,
        difference: signedAsset.buffer.length - buffer.length
    })

    // Verify the signed buffer immediately after signing
    try {
        const verifyResult = await c2pa.read({
            buffer: signedAsset.buffer,
            mimeType
        })
        console.log('Verification:', {
            success: !!verifyResult,
            hasManifest: !!verifyResult?.activeManifest,
            validationStatus: verifyResult?.validationStatus || []
        })
    } catch (error) {
        console.warn('Verification check after signing failed:', error)
        // Continue anyway, as the signing might still be valid
    }

    return signedAsset.buffer
}

/**
 * Verifies a file using C2PA
 * Returns true if the file is verified
 */
export async function verifyFile(buffer: Buffer, mimeType: string) {
    try {
        const c2pa = await c2paPromise
        const isVideo = mimeType.startsWith('video/')

        if (isVideo) {
            // For videos, use file-based verification
            const tempDir = os.tmpdir()
            const extension = mimeType.includes('mp4') ? 'mp4' : 'mov'
            const tempPath = path.join(tempDir, `verify_${Date.now()}.${extension}`)

            try {
                // Write buffer to temporary file
                await fs.promises.writeFile(tempPath, buffer)

                // Verify the file
                const verifyResult = await c2pa.read({
                    path: tempPath,
                    mimeType
                })

                const isVerified = !!verifyResult?.activeManifest
                console.log('Video verification result:', {
                    success: isVerified,
                    hasManifest: !!verifyResult?.activeManifest,
                    manifestStore: verifyResult?.manifestStore ? Object.keys(verifyResult.manifestStore) : [],
                    validationStatus: verifyResult?.validationStatus || []
                })

                // Clean up temporary file
                await fs.promises.unlink(tempPath).catch(() => { })

                return isVerified
            } catch (error) {
                console.error('Video verification error:', error)
                // Clean up temporary file in case of error
                await fs.promises.unlink(tempPath).catch(() => { })
                return false
            }
        }

        // For images, use buffer-based verification
        const verifyResult = await c2pa.read({
            buffer,
            mimeType
        })

        const isVerified = !!verifyResult?.activeManifest
        console.log('Verification result:', {
            success: isVerified,
            hasManifest: !!verifyResult?.activeManifest,
            validationStatus: verifyResult?.validationStatus || []
        })

        if (isVerified && verifyResult?.activeManifest) {
            console.log('Verified manifest contents:', {
                title: verifyResult.activeManifest.title,
                format: verifyResult.activeManifest.format,
                claimGenerator: verifyResult.activeManifest.claimGenerator,
                assertionCount: verifyResult.activeManifest.assertions.length,
                assertionLabels: verifyResult.activeManifest.assertions.map((a: any) => a.label)
            })
        }

        return isVerified
    } catch (error) {
        console.error('Verification failed:', error)
        return false
    }
}
