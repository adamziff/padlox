interface UploadResponse {
    url: string
    key: string
}

interface AssetMetadata {
    name?: string;
    description?: string | null;
    estimated_value?: number | null;
}

export async function uploadToS3(file: File, metadata?: AssetMetadata): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    
    if (metadata) {
        formData.append('metadata', JSON.stringify(metadata))
    }

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to upload file: ${response.status} ${response.statusText} - ${errorText}`)
        }

        const data = await response.json()
        return data
    } catch (error: unknown) {
        const err = error as Error & { status?: number }
        console.error('S3 upload error:', {
            message: err?.message,
            status: err?.status,
            stack: err?.stack
        })
        throw err
    }
} 