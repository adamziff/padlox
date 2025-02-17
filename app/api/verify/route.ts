import { NextResponse } from 'next/server'
import { verifyFile } from '@/utils/server/c2pa'

export async function POST(request: Request) {
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
        const result = await verifyFile(buffer, file.type)

        return NextResponse.json(result)
    } catch (error: unknown) {
        console.error('Verification error:', error)
        return new NextResponse(
            JSON.stringify({
                error: 'Verification failed',
                details: (error as Error)?.message,
                isValid: false,
                manifests: [],
                validationStatus: []
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
} 