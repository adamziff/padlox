import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
})

export async function uploadToS3(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        throw new Error('Upload failed')
    }

    const { url } = await response.json()
    return url
}

export function getS3Url(key: string): string {
    return `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${key}`
} 