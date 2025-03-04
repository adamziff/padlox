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

    try {
        const response = await fetch('/api/sign', {
            method: 'POST',
            body: formData,
            // Add these headers to ensure proper handling
            headers: {
                // Don't set Content-Type with FormData as the browser will set it with boundary
                'Accept': 'application/octet-stream',
            },
            // Add these options to ensure cookies are sent
            credentials: 'same-origin',
            cache: 'no-store',
        })

        if (!response.ok) {
            let errorMessage = 'Failed to sign file';
            try {
                const errorData = await response.json();
                errorMessage = errorData.details || errorMessage;
            } catch (e) {
                // If we can't parse the error as JSON, use status text
                errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
            }
            throw new Error(errorMessage);
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
    } catch (error) {
        console.error('Error signing file:', error);
        throw error;
    }
}

export async function verifyMediaFile(file: File): Promise<boolean> {
    const formData = new FormData()
    formData.append('file', file)

    console.log('Verifying file:', {
        name: file.name,
        type: file.type,
        size: file.size
    })

    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            body: formData,
            // Add these options to ensure cookies are sent
            credentials: 'same-origin',
            cache: 'no-store',
        })

        if (!response.ok) {
            let errorMessage = 'Failed to verify file';
            try {
                const errorData = await response.json();
                errorMessage = errorData.details || errorMessage;
            } catch (e) {
                // If we can't parse the error as JSON, use status text
                errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const result = await response.json()

        console.log('Verification result:', result)

        return result.verified
    } catch (error) {
        console.error('Error verifying file:', error);
        throw error;
    }
} 