'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { CameraCapture } from '@/components/camera-capture'
import { MediaPreview } from '@/components/media-preview'
import { AssetModal } from '@/components/asset-modal'
import { uploadToS3 } from '@/utils/s3'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/format'
import { Asset } from '@/types/asset'
import { TrashIcon } from '@/components/icons'

export default function Dashboard() {
    const [showCamera, setShowCamera] = useState(false)
    const [capturedFile, setCapturedFile] = useState<File | null>(null)
    const [assets, setAssets] = useState<Asset[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({})
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

            // Transform the assets to use the correct S3 URL format
            const transformedAssets = assets?.map(asset => ({
                ...asset,
                media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`
            })) || []

            console.log('Successfully loaded assets:', transformedAssets)
            setAssets(transformedAssets)
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
            const response = await uploadToS3(capturedFile)
            const { url: s3Url, key } = typeof response === 'string' ? { url: response, key: response.split('/').pop()! } : response
            console.log('File uploaded successfully:', { s3Url, key })

            console.log('Saving asset to database...')
            const { data: asset, error } = await supabase
                .from('assets')
                .insert([{
                    user_id: user.id,
                    name: metadata.name,
                    description: metadata.description,
                    estimated_value: metadata.estimated_value,
                    media_url: key,
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

            // Transform the asset to include the full S3 URL
            const transformedAsset = {
                ...asset,
                media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`
            }

            console.log('Asset saved successfully:', transformedAsset)
            setAssets(prev => [transformedAsset, ...prev])
            setCapturedFile(null)
        } catch (error: any) {
            console.error('Error saving asset:', {
                message: error?.message,
                details: error?.details,
                stack: error?.stack,
                name: error?.name
            })
            alert('Failed to save asset. Please try again.')
        }
    }

    function toggleAssetSelection(assetId: string, event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) {
        event.stopPropagation()
        const newSelectedAssets = new Set(selectedAssets)
        if (newSelectedAssets.has(assetId)) {
            newSelectedAssets.delete(assetId)
        } else {
            newSelectedAssets.add(assetId)
        }
        setSelectedAssets(newSelectedAssets)
    }

    async function handleBulkDelete() {
        if (!window.confirm(`Are you sure you want to delete ${selectedAssets.size} assets? This action cannot be undone.`)) {
            return
        }

        setIsDeleting(true)
        try {
            const assetsToDelete = assets.filter(asset => selectedAssets.has(asset.id))

            for (const asset of assetsToDelete) {
                // Delete from Supabase
                const { error: dbError } = await supabase
                    .from('assets')
                    .delete()
                    .eq('id', asset.id)

                if (dbError) throw dbError

                // Delete from S3
                const key = asset.media_url.split('/').pop()
                const response = await fetch('/api/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ key }),
                })

                if (!response.ok) {
                    throw new Error('Failed to delete file from S3')
                }
            }

            setAssets(prev => prev.filter(asset => !selectedAssets.has(asset.id)))
            setSelectedAssets(new Set())
            setIsSelectionMode(false)
        } catch (error) {
            console.error('Error deleting assets:', error)
            alert('Failed to delete some assets. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    function handleAssetClick(asset: Asset, event: React.MouseEvent) {
        if (isSelectionMode) {
            toggleAssetSelection(asset.id, event)
        } else {
            setSelectedAsset(asset)
        }
    }

    function handleAssetDeleted(deletedAssetId: string) {
        setAssets(prev => prev.filter(asset => asset.id !== deletedAssetId))
    }

    // Add function to handle media errors
    function handleMediaError(assetId: string, url: string, type: 'image' | 'video', error: any) {
        console.error(`Error loading ${type}:`, {
            assetId,
            url,
            error,
            timestamp: new Date().toISOString()
        })
        setMediaErrors(prev => ({ ...prev, [assetId]: true }))
    }

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>
    }

    return (
        <div className="container mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold">My Assets</h1>
                <div className="flex items-center gap-4">
                    {assets.length > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsSelectionMode(!isSelectionMode)
                                setSelectedAssets(new Set())
                            }}
                        >
                            {isSelectionMode ? 'Cancel Selection' : 'Select Multiple'}
                        </Button>
                    )}
                    {isSelectionMode && selectedAssets.size > 0 && (
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                        >
                            <TrashIcon className="h-4 w-4 mr-2" />
                            Delete Selected ({selectedAssets.size})
                        </Button>
                    )}
                    <Button onClick={() => setShowCamera(true)}>
                        Add New Asset
                    </Button>
                </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {assets.map(asset => {
                    console.log('Rendering asset:', {
                        id: asset.id,
                        name: asset.name,
                        url: asset.media_url,
                        type: asset.media_type,
                        hasError: mediaErrors[asset.id]
                    })

                    return (
                        <div
                            key={asset.id}
                            className={`group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity ${selectedAssets.has(asset.id) ? 'ring-2 ring-primary' : ''
                                }`}
                            onClick={(e) => handleAssetClick(asset, e)}
                        >
                            {isSelectionMode && (
                                <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedAssets.has(asset.id)}
                                        onChange={(e) => toggleAssetSelection(asset.id, e)}
                                        className="h-5 w-5 cursor-pointer"
                                    />
                                </div>
                            )}

                            {mediaErrors[asset.id] ? (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <div className="text-center p-4">
                                        <p className="text-sm">Failed to load media</p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                // Clear error and force reload
                                                setMediaErrors(prev => {
                                                    const next = { ...prev }
                                                    delete next[asset.id]
                                                    return next
                                                })
                                            }}
                                            className="text-xs text-primary hover:underline mt-2"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            ) : asset.media_type === 'video' ? (
                                <video
                                    key={`${asset.media_url}-${mediaErrors[asset.id] ? 'retry' : 'initial'}`}
                                    src={asset.media_url}
                                    className="w-full h-full object-cover"
                                    poster={`${asset.media_url}?t=${Date.now()}`}
                                    onError={(e) => {
                                        const target = e.target as HTMLVideoElement
                                        handleMediaError(
                                            asset.id,
                                            asset.media_url,
                                            'video',
                                            {
                                                networkState: target.networkState,
                                                readyState: target.readyState,
                                                error: target.error?.message,
                                                code: target.error?.code
                                            }
                                        )
                                    }}
                                    preload="metadata"
                                    muted
                                    playsInline
                                />
                            ) : (
                                <img
                                    key={`${asset.media_url}-${mediaErrors[asset.id] ? 'retry' : 'initial'}`}
                                    src={asset.media_url}
                                    alt={asset.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement
                                        handleMediaError(
                                            asset.id,
                                            asset.media_url,
                                            'image',
                                            {
                                                complete: target.complete,
                                                naturalWidth: target.naturalWidth,
                                                naturalHeight: target.naturalHeight
                                            }
                                        )
                                    }}
                                    loading="lazy"
                                />
                            )}

                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                                <h3 className="text-white font-medium truncate">{asset.name}</h3>
                                {asset.estimated_value && (
                                    <p className="text-white/90 text-sm">
                                        {formatCurrency(asset.estimated_value)}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {selectedAsset && (
                <AssetModal
                    asset={selectedAsset}
                    onClose={() => setSelectedAsset(null)}
                    onDelete={() => handleAssetDeleted(selectedAsset.id)}
                />
            )}
        </div>
    )
}