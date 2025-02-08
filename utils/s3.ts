export async function uploadToS3(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)

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
        return data.url
    } catch (error: any) {
        console.error('S3 upload error:', {
            message: error?.message,
            status: error?.status,
            stack: error?.stack
        })
        throw error
    }
} 