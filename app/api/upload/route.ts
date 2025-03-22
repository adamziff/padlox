import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { signFile } from '@/utils/server/mediaSigningService'
import { corsJsonResponse, corsErrorResponse, corsOptionsResponse, withAuth } from '@/lib/api'
import { createServerSupabaseClient } from '@/lib/auth/supabase'

const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    useArnRegion: true
})

export const POST = withAuth(async (request: Request) => {
    // User is guaranteed to exist due to withAuth middleware
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        return corsErrorResponse('User not found', 401)
    }

    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const metadata = JSON.parse(formData.get('metadata') as string || '{}')

        if (!file) {
            return corsErrorResponse('No file provided', 400)
        }

        // Convert file to buffer
        const buffer = Buffer.from(await file.arrayBuffer())

        // Sign the file (for images only - videos will return the original buffer)
        const signedBuffer = await signFile(buffer, file.type, file.name, {
            name: metadata.name || file.name,
            description: metadata.description || null,
            estimated_value: metadata.estimated_value || null
        })

        // Generate a unique key for the file
        const timestamp = Date.now()
        const key = `${user.id}/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

        const isVideo = file.type.startsWith('video/')

        console.log('Uploading file to S3:', {
            bucket: process.env.AWS_BUCKET_NAME,
            key,
            contentType: file.type,
            originalSize: buffer.length,
            signedSize: signedBuffer.length,
            isVideo: isVideo
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
                'c2pa-signed': isVideo ? 'false' : 'true',
                'original-size': buffer.length.toString(),
                'signed-size': signedBuffer.length.toString()
            },
            ContentDisposition: 'inline',
            ContentEncoding: 'identity',
        })

        await s3Client.send(command)

        // Return both the full URL and the key
        const url = `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${key}`

        console.log('File uploaded successfully:', {
            key,
            url,
            contentType: file.type,
            originalSize: buffer.length,
            signedSize: signedBuffer.length,
            isVideo: isVideo
        })

        return corsJsonResponse({ url, key })
    } catch (error: unknown) {
        const err = error as Error & { code?: string }
        console.error('Upload error:', {
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
        })
        return corsErrorResponse('Upload failed', 500, { message: err?.message })
    }
})

export async function OPTIONS() {
    return corsOptionsResponse()
}