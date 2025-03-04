import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { signFile } from '@/utils/server/mediaSigningService'

export async function POST(request: Request) {
    try {
        // Verify authentication
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            console.error('Authentication error in /api/sign:', error);
            return new NextResponse(
                JSON.stringify({ error: 'Unauthorized', details: error?.message || 'User not authenticated' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Parse the form data
        const formData = await request.formData()
        const file = formData.get('file') as File
        const metadataStr = formData.get('metadata') as string

        if (!file) {
            console.error('No file provided in /api/sign request');
            return new NextResponse(
                JSON.stringify({ error: 'Bad Request', details: 'No file provided' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Parse metadata with error handling
        let metadata;
        try {
            metadata = JSON.parse(metadataStr || '{}')
        } catch (err) {
            console.error('Invalid metadata JSON in /api/sign:', err);
            return new NextResponse(
                JSON.stringify({ error: 'Bad Request', details: 'Invalid metadata format' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        console.log('Signing file in /api/sign:', {
            name: file.name,
            type: file.type,
            size: buffer.length,
            userId: user.id
        });

        // Sign the file using the server-side utility
        const signedBuffer = await signFile(buffer, file.type, file.name, metadata)

        console.log('File signed successfully:', {
            name: file.name,
            originalSize: buffer.length,
            signedSize: signedBuffer.length
        });

        // Return the signed buffer
        return new NextResponse(signedBuffer, {
            headers: {
                'Content-Type': file.type,
                'Content-Disposition': `attachment; filename="${file.name}"`,
                'Cache-Control': 'no-cache',
                'Content-Length': signedBuffer.length.toString()
            },
        })
    } catch (error: unknown) {
        console.error('Signing error in /api/sign:', error)
        return new NextResponse(
            JSON.stringify({
                error: 'Signing failed',
                details: (error as Error)?.message || 'Unknown error during signing process'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
} 