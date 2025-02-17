import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    useArnRegion: true
})

export async function POST(request: Request) {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const { key, filename } = await request.json()

        if (!key) {
            return new NextResponse('No key provided', { status: 400 })
        }

        // Extract the key if it's a full S3 URL
        const actualKey = key.includes('amazonaws.com/')
            ? key.split('amazonaws.com/').pop()
            : key

        // Verify the key belongs to the user
        if (!actualKey?.startsWith(user.id + '/')) {
            console.error('Unauthorized access attempt:', {
                userId: user.id,
                key: actualKey,
                originalKey: key
            })
            return new NextResponse('Unauthorized', { status: 401 })
        }

        console.log('Downloading file:', {
            bucket: process.env.AWS_BUCKET_NAME,
            key: actualKey,
            filename
        })

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: actualKey
        })

        const response = await s3Client.send(command)

        if (!response.Body) {
            throw new Error('No response body')
        }

        // Convert the readable stream to a buffer
        const chunks = []
        for await (const chunk of response.Body as Readable) {
            chunks.push(chunk)
        }
        const buffer = Buffer.concat(chunks)

        console.log('Download successful:', {
            contentType: response.ContentType,
            contentLength: buffer.length,
            filename: filename || actualKey.split('/').pop()
        })

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': response.ContentType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename || actualKey.split('/').pop()}"`,
                'Content-Length': buffer.length.toString()
            }
        })
    } catch (error: unknown) {
        const err = error as Error & { code?: string }
        console.error('Download error:', {
            message: err?.message,
            code: err?.code,
            stack: err?.stack
        })
        return new NextResponse(
            JSON.stringify({ error: 'Download failed', details: err?.message }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        )
    }
} 