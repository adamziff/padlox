import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { signFile } from '@/utils/server/mediaSigningService'

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
        const metadata = JSON.parse(formData.get('metadata') as string)

        if (!file) {
            return new NextResponse('No file provided', { status: 400 })
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Sign the file using the server-side utility
        const signedBuffer = await signFile(buffer, file.type, file.name, metadata)

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
        console.error('Signing error:', error)
        return new NextResponse(
            JSON.stringify({ error: 'Signing failed', details: (error as Error)?.message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
} 