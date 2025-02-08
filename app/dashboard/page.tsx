'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { CameraCapture } from '@/components/camera-capture'
import { MediaPreview } from '@/components/media-preview'
import { uploadToS3 } from '@/utils/s3'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/format'

interface Asset {
    id: string
    name: string
    description: string | null
    estimated_value: number | null
    media_url: string
    media_type: 'image' | 'video'
    created_at: string
}

export default function Dashboard() {
    const [showCamera, setShowCamera] = useState(false)
    const [capturedFile, setCapturedFile] = useState<File | null>(null)
    const [assets, setAssets] = useState<Asset[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const supabase = createClient()
    const router = useRouter()

    async function ensureUserExists(user: { id: string, email?: string | undefined }) {
        try {
            // First check if user exists
            const { data: existingUser, error: fetchError } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single()

            if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" error
                console.error('Error checking for existing user:', {
                    message: fetchError.message,
                    details: fetchError.details,
                    hint: fetchError.hint,
                    code: fetchError.code
                })
                throw fetchError
            }

            // If user doesn't exist, create them
            if (!existingUser) {
                if (!user.email) {
                    console.error('Cannot create user: email is required')
                    throw new Error('User email is required')
                }

                // Create a service role client for database operations
                const serviceRoleClient = await createClient()

                const { data: newUser, error: insertError } = await serviceRoleClient
                    .from('users')
                    .insert([{
                        id: user.id,
                        email: user.email,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }])
                    .select()
                    .single()

                if (insertError) {
                    console.error('Error creating user:', {
                        message: insertError.message,
                        details: insertError.details,
                        hint: insertError.hint,
                        code: insertError.code
                    })
                    throw insertError
                }

                console.log('Successfully created new user:', newUser)
                return newUser
            }

            console.log('User already exists:', existingUser)
            return existingUser
        } catch (error: any) {
            console.error('Error in ensureUserExists:', {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code,
                stack: error?.stack
            })
            throw error
        }
    }

    useEffect(() => {
        async function loadAssets() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                console.error('No authenticated user found')
                router.push('/login')
                return
            }

            // Ensure user exists in the database
            try {
                await ensureUserExists(user)
            } catch (error) {
                console.error('Failed to ensure user exists:', error)
                return
            }

            console.log('Fetching assets for user:', user.id)
            const { data: assets, error } = await supabase
                .from('assets')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Error loading assets:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                })
                return
            }

            console.log('Successfully loaded assets:', assets?.length || 0)
            setAssets(assets || [])
            setIsLoading(false)
        }

        loadAssets()
    }, [])

    async function handleCapture(file: File) {
        setCapturedFile(file)
        setShowCamera(false)
    }

    async function handleSave(url: string, metadata: {
        name: string
        description: string | null
        estimated_value: number | null
    }) {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                console.error('No authenticated user found')
                router.push('/login')
                return
            }

            // Ensure user exists in the database
            try {
                await ensureUserExists(user)
            } catch (error) {
                console.error('Failed to ensure user exists:', error)
                return
            }

            if (!capturedFile) {
                console.error('No file captured')
                return
            }

            console.log('Uploading file to S3...')
            const s3Url = await uploadToS3(capturedFile)
            console.log('File uploaded successfully:', s3Url)

            console.log('Saving asset to database...')
            const { data: asset, error } = await supabase
                .from('assets')
                .insert([{
                    user_id: user.id,
                    name: metadata.name,
                    description: metadata.description,
                    estimated_value: metadata.estimated_value,
                    media_url: s3Url,
                    media_type: capturedFile.type.startsWith('video/') ? 'video' : 'image'
                }])
                .select()
                .single()

            if (error) {
                console.error('Database error:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                })
                throw error
            }

            console.log('Asset saved successfully:', asset)
            setAssets(prev => [asset, ...prev])
            setCapturedFile(null)
        } catch (error: any) {
            console.error('Error saving asset:', {
                message: error?.message,
                details: error?.details,
                stack: error?.stack,
                name: error?.name
            })
            // TODO: Show error toast
        }
    }

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>
    }

    return (
        <div className="container mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">My Assets</h1>
                <Button onClick={() => setShowCamera(true)}>
                    Add New Asset
                </Button>
            </div>

            {showCamera && (
                <CameraCapture
                    onCapture={handleCapture}
                    onClose={() => setShowCamera(false)}
                />
            )}

            {capturedFile && (
                <MediaPreview
                    file={capturedFile}
                    onSave={handleSave}
                    onRetry={() => {
                        setCapturedFile(null)
                        setShowCamera(true)
                    }}
                    onCancel={() => setCapturedFile(null)}
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assets.map(asset => (
                    <div
                        key={asset.id}
                        className="border rounded-lg overflow-hidden bg-card"
                    >
                        <div className="aspect-video relative">
                            {asset.media_type === 'video' ? (
                                <video
                                    src={asset.media_url}
                                    className="w-full h-full object-cover"
                                    controls
                                />
                            ) : (
                                <img
                                    src={asset.media_url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>
                        <div className="p-4">
                            <h3 className="font-semibold text-lg">{asset.name}</h3>
                            {asset.description && (
                                <p className="text-muted-foreground mt-1 line-clamp-2">
                                    {asset.description}
                                </p>
                            )}
                            {asset.estimated_value && (
                                <p className="text-sm font-medium text-primary mt-2">
                                    Estimated Value: {formatCurrency(asset.estimated_value)}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}