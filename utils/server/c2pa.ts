import { createC2pa, createTestSigner, ManifestBuilder } from 'c2pa-node'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Initialize C2PA with test signer for development - this is safe to do on the server side
export const c2paPromise = (async () => {
    const signer = await createTestSigner({
        certificatePath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pub'),
        privateKeyPath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pem')
    })
    return createC2pa({
        signer,
    })
})()

function createManifest(metadata: {
    name: string;
    description: string | null;
    estimated_value: number | null;
}, mimeType: string) {
    const timestamp = new Date().toISOString()

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
                            when: timestamp,
                            softwareAgent: 'Padlox/1.0.0',
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
                    '@type': 'CreativeWork',
                    'name': metadata.name,
                    'description': metadata.description || '',
                    'dateCreated': timestamp,
                    'creator': {
                        '@type': 'Organization',
                        'name': 'Padlox Home Inventory',
                        'url': 'https://padlox.com'
                    },
                    'copyrightYear': new Date().getFullYear(),
                    'license': 'https://creativecommons.org/licenses/by/4.0/'
                },
            },
            {
                label: 'com.padlox.metadata',
                data: {
                    description: metadata.description || '',
                    estimated_value: metadata.estimated_value || 0,
                    capture_time: timestamp,
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
            const manifest = new ManifestBuilder({
                claim_generator: 'Padlox/1.0.0',
                format: 'video/mp4',
                title: metadata.name,
                assertions: [
                    {
                        label: 'c2pa.actions',
                        data: {
                            actions: [
                                {
                                    action: 'c2pa.created',
                                    when: new Date().toISOString(),
                                    softwareAgent: 'Padlox/1.0.0',
                                    parameters: {
                                        input: {
                                            asset: {
                                                format: 'video/mp4',
                                                title: metadata.name
                                            }
                                        }
                                    }
                                }
                            ],
                        },
                    },
                    {
                        label: 'stds.schema-org.VideoObject',
                        data: {
                            '@context': 'https://schema.org',
                            '@type': 'VideoObject',
                            'name': metadata.name,
                            'description': metadata.description || '',
                            'uploadDate': new Date().toISOString(),
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
    } else {
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
        } catch (error: unknown) {
            console.error('Verification failed:', error instanceof Error ? error.message : String(error))
        }

        return signedAsset.buffer
    }
}

export async function verifyFile(buffer: Buffer, mimeType: string) {
    const c2pa = await c2paPromise
    try {
        const isVideo = mimeType.startsWith('video/')
        let result

        if (isVideo) {
            // For videos, use file-based verification
            const tempDir = os.tmpdir()
            const tempPath = path.join(tempDir, `verify_${Date.now()}.${mimeType.split('/')[1]}`)

            try {
                // Write buffer to temporary file
                await fs.promises.writeFile(tempPath, buffer)

                // Verify the file using buffer
                result = await c2pa.read({
                    buffer: await fs.promises.readFile(tempPath),
                    mimeType
                })

                // Clean up temporary file
                await fs.promises.unlink(tempPath).catch(console.error)
            } catch (error) {
                // Clean up temporary file in case of error
                await fs.promises.unlink(tempPath).catch(() => { })
                throw error
            }
        } else {
            // For images, use buffer-based verification
            result = await c2pa.read({ buffer, mimeType })
        }

        // More detailed verification
        if (result) {
            const manifests = result.activeManifest
            return {
                isValid: true,
                manifests: manifests ? [manifests] : [],
                validationStatus: result.validationStatus || []
            }
        }
        return { isValid: false, manifests: [], validationStatus: [] }
    } catch (error) {
        console.error('Verification error:', error)
        return { isValid: false, manifests: [], validationStatus: [] }
    }
} 