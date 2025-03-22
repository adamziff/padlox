/**
 * C2PA Media authentication client-side utilities
 */

/**
 * Signs a media file using the C2PA API
 * @param file - The file to sign
 * @param metadata - Metadata to include in the signature
 * @returns A signed file
 */
export async function signMediaFile(file: File, metadata: {
  name: string
  description: string | null
  estimated_value: number | null
}): Promise<File> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('metadata', JSON.stringify(metadata))

  try {
    const response = await fetch('/api/sign', {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/octet-stream',
      },
      credentials: 'same-origin',
      cache: 'no-store',
    })

    if (!response.ok) {
      let errorMessage = 'Failed to sign file'
      try {
        const errorData = await response.json()
        errorMessage = errorData.details || errorMessage
      } catch (e) {
        // If we can't parse the error as JSON, use status text
        console.error('Error signing file:', e)
        errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`
      }
      throw new Error(errorMessage)
    }

    const signedBuffer = await response.blob()
    const signedFile = new File([signedBuffer], file.name, {
      type: file.type,
      lastModified: Date.now()
    })

    return signedFile
  } catch (error) {
    console.error('Error signing file:', error)
    throw error
  }
}

/**
 * Verifies a media file using the C2PA API
 * @param file - The file to verify
 * @returns Whether the file is verified
 */
export async function verifyMediaFile(file: File): Promise<boolean> {
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await fetch('/api/verify', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
      cache: 'no-store',
    })

    if (!response.ok) {
      let errorMessage = 'Failed to verify file'
      try {
        const errorData = await response.json()
        errorMessage = errorData.details || errorMessage
      } catch (e) {
        // If we can't parse the error as JSON, use status text
        console.error('Error verifying file:', e)
        errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`
      }
      throw new Error(errorMessage)
    }

    const result = await response.json()
    return result.verified
  } catch (error) {
    console.error('Error verifying file:', error)
    throw error
  }
}