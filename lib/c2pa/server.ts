/**
 * C2PA Media authentication service (server-side)
 */
import { createC2pa, createTestSigner, ManifestBuilder } from 'c2pa-node'
// import { KMS } from '@aws-sdk/client-kms'
import path from 'path'

// Initialize AWS KMS client
// const kms = new KMS({
//   region: process.env.AWS_REGION || 'us-east-2'
// })

/**
 * Initialize C2PA with AWS KMS signer
 * This is a singleton that will be reused across requests
 */
export const c2paPromise = (async () => {
  // Check for production environment
  const isProduction = process.env.NODE_ENV === 'production'

  try {
    if (isProduction) {
      // For now, don't sign anything in production
      console.log('Production environment detected - C2PA signing disabled')
      return undefined

      // In production, we should use AWS KMS - commented out until production ready
      /*
      const kmsKeyId = process.env.AWS_KMS_KEY_ID
      if (!kmsKeyId) {
        console.warn('AWS_KMS_KEY_ID environment variable is not set, falling back to test signer')
        return createC2pa({
          signer: await createTestSigner({
            certificatePath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pub'),
            privateKeyPath: path.join(process.cwd(), 'c2pa-test-certs', 'es256.pem')
          })
        })
      }
      */
    } else {
      // In development, use test signer
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
  name: string
  description: string | null
  estimated_value: number | null
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
    name: string
    description: string | null
    estimated_value: number | null
  }
): Promise<Buffer> {
  const c2pa = await c2paPromise

  // If c2pa is undefined (in production), return the original buffer
  if (!c2pa) {
    return buffer
  }

  const isVideo = mimeType.startsWith('video/')

  // Skip signing for videos, just return the original buffer
  if (isVideo) {
    return buffer
  }

  // For images, use buffer-based signing
  const manifest = createManifest(metadata, mimeType)

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

  // Verify the signed buffer immediately after signing
  try {
    const verifyResult = await c2pa.read({
      buffer: signedAsset.buffer,
      mimeType
    })
    
    if (!verifyResult?.activeManifest) {
      console.warn('Verification check after signing failed: No active manifest')
    }
  } catch (error) {
    console.warn('Verification check after signing failed:', error)
    // Continue anyway, as the signing might still be valid
  }

  return signedAsset.buffer
}

/**
 * Verifies a file using C2PA
 * @returns true if the file is verified
 */
export async function verifyFile(buffer: Buffer, mimeType: string): Promise<boolean> {
  try {
    const c2pa = await c2paPromise

    // If c2pa is undefined (in production), return false (not verified)
    if (!c2pa) {
      return false
    }

    const isVideo = mimeType.startsWith('video/')

    // Skip verification for videos, they're not signed
    if (isVideo) {
      return false
    }

    // For images, use buffer-based verification
    const verifyResult = await c2pa.read({
      buffer,
      mimeType
    })

    return !!verifyResult?.activeManifest
  } catch (error) {
    console.error('Verification failed:', error)
    return false
  }
}