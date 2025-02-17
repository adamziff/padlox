// This file only contains the client-side interface to the C2PA API endpoints
export async function signMediaFile(file: File, metadata: {
    name: string;
    description: string | null;
    estimated_value: number | null;
}): Promise<File> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('metadata', JSON.stringify(metadata))

    console.log('Signing file:', {
        name: file.name,
        type: file.type,
        size: file.size
    })

    const response = await fetch('/api/sign', {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Failed to sign file')
    }

    const signedBuffer = await response.blob()
    const signedFile = new File([signedBuffer], file.name, {
        type: file.type,
        lastModified: Date.now()
    })

    console.log('Signed file:', {
        name: signedFile.name,
        type: signedFile.type,
        originalSize: file.size,
        signedSize: signedFile.size,
        difference: signedFile.size - file.size
    })

    return signedFile
}

export async function verifyMediaFile(file: File): Promise<boolean> {
    try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/verify', {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            return false
        }

        const result = await response.json()
        return result.isValid
    } catch (error) {
        console.error('Error verifying file:', error)
        return false
    }
} 