import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { verifyFile } from '@/utils/server/mediaSigningService'

export async function POST(request: Request) {
    try {
        // Verify authentication
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            console.error('Authentication error in /api/verify:', error);
            return new NextResponse(
                JSON.stringify({ error: 'Unauthorized', details: error?.message || 'User not authenticated' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Parse the form data
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            console.error('No file provided in /api/verify request');
            return new NextResponse(
                JSON.stringify({ error: 'Bad Request', details: 'No file provided' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        console.log('Verifying file in /api/verify:', {
            name: file.name,
            type: file.type,
            size: buffer.length,
            userId: user.id
        });

        // Verify the file using the server-side utility
        const isVerified = await verifyFile(buffer, file.type)

        console.log('File verification result:', {
            name: file.name,
            verified: isVerified
        });

        // Return verification result
        return NextResponse.json({
            verified: isVerified,
            fileName: file.name,
            mimeType: file.type,
            size: buffer.length
        })
    } catch (error: unknown) {
        console.error('Verification error in /api/verify:', error)
        return new NextResponse(
            JSON.stringify({
                error: 'Verification failed',
                details: (error as Error)?.message || 'Unknown error during verification process'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
} 