import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { verifyFile } from '@/utils/server/mediaSigningService'

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

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Verify the file using the server-side utility
        const isVerified = await verifyFile(buffer, file.type)

        // Return verification result
        return NextResponse.json({
            verified: isVerified,
            fileName: file.name,
            mimeType: file.type,
            size: buffer.length
        })
    } catch (error: unknown) {
        console.error('Verification error:', error)
        return new NextResponse(
            JSON.stringify({ error: 'Verification failed', details: (error as Error)?.message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
} 