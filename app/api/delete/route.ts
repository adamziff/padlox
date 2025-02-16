import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
})

export async function POST(request: Request) {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const { key } = await request.json()

        if (!key) {
            return new NextResponse('No key provided', { status: 400 })
        }

        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: key,
        })

        await s3Client.send(command)

        return NextResponse.json(
            { success: true },
            {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
            }
        )
    } catch (error: unknown) {
        const err = error as Error & { code?: string }
        console.error('Delete error:', {
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
        })
        return new NextResponse(
            JSON.stringify({ error: 'Delete failed', details: err?.message }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                }
            }
        )
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    })
} 