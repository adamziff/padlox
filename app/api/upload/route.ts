import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { signFile } from '@/utils/server/c2pa'

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
        const formData = await request.formData()
        const file = formData.get('file') as File
        const metadata = JSON.parse(formData.get('metadata') as string || '{}')

        if (!file) {
            return new NextResponse('No file provided', { status: 400 })
        }

        // First, sign the file
        const buffer = Buffer.from(await file.arrayBuffer())
        const signedBuffer = await signFile(buffer, file.type, file.name, {
            name: metadata.name || file.name,
            description: metadata.description || null,
            estimated_value: metadata.estimated_value || null
        })

        // Generate a unique key for the file
        const timestamp = Date.now()
        const key = `${user.id}/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

        console.log('Uploading signed file to S3:', {
            bucket: process.env.AWS_BUCKET_NAME,
            key,
            contentType: file.type,
            originalSize: buffer.length,
            signedSize: signedBuffer.length
        })

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: key,
            Body: signedBuffer,
            ContentType: file.type,
            CacheControl: 'max-age=31536000',
            Metadata: {
                'original-filename': file.name,
                'user-id': user.id,
                'upload-timestamp': timestamp.toString(),
                'c2pa-signed': 'true',
                'original-size': buffer.length.toString(),
                'signed-size': signedBuffer.length.toString()
            },
            ContentDisposition: 'inline',
            ContentEncoding: 'identity',
        })

        await s3Client.send(command)

        // Return both the full URL and the key
        const url = `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${key}`

        console.log('Signed file uploaded successfully:', {
            key,
            url,
            contentType: file.type,
            originalSize: buffer.length,
            signedSize: signedBuffer.length
        })

        return NextResponse.json(
            { url, key },
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
        console.error('Upload error:', {
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
        })
        return new NextResponse(
            JSON.stringify({ error: 'Upload failed', details: err?.message }),
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