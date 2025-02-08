import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return new NextResponse('No file provided', { status: 400 })
        }

        const key = `${user.id}/${Date.now()}-${file.name}`
        const buffer = Buffer.from(await file.arrayBuffer())

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: key,
            Body: buffer,
            ContentType: file.type,
        })

        await s3Client.send(command)

        const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`

        return NextResponse.json({ url })
    } catch (error) {
        console.error('Upload error:', error)
        return new NextResponse('Upload failed', { status: 500 })
    }
} 