/**
 * AWS S3 utilities for file operations
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Create a singleton S3 client for server operations
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  useArnRegion: true
})

/**
 * Client-side interface for uploading a file to S3 via API
 * @param file - The file to upload
 * @param metadata - Optional metadata for the file
 * @returns The S3 URL and key of the uploaded file
 */
export async function uploadToS3(file: File, metadata?: {
  name?: string
  description?: string | null
  estimated_value?: number | null
}): Promise<{ url: string, key: string }> {
  const formData = new FormData()
  formData.append('file', file)
  
  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata))
  }

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return await response.json()
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    console.error('S3 upload error:', {
      message: err?.message,
      status: err?.status,
      stack: err?.stack
    })
    throw err
  }
}

/**
 * Server-side function to upload a file to S3
 * @param buffer - The file buffer
 * @param fileName - The name of the file
 * @param contentType - The MIME type of the file
 * @param userId - The user ID for the file owner
 * @param metadata - Optional additional metadata
 * @returns The S3 URL and key of the uploaded file
 */
export async function uploadFileToS3(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  userId: string,
  metadata: Record<string, string> = {}
) {
  const timestamp = Date.now()
  const key = `${userId}/${timestamp}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'max-age=31536000',
    Metadata: {
      'original-filename': fileName,
      'user-id': userId,
      'upload-timestamp': timestamp.toString(),
      ...metadata
    },
    ContentDisposition: 'inline',
    ContentEncoding: 'identity',
  })

  await s3Client.send(command)

  return {
    key,
    url: getS3Url(key)
  }
}

/**
 * Deletes a file from S3
 * Server-side only
 */
export async function deleteFileFromS3(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key
  })

  await s3Client.send(command)
}

/**
 * Creates a pre-signed URL for downloading a file from S3
 * Server-side only
 */
export async function createPresignedDownloadUrl(key: string, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key
  })

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds })
}

/**
 * Gets the public S3 URL for a key
 * Can be used on client or server
 */
export function getS3Url(key: string): string {
  return `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${key}`
}