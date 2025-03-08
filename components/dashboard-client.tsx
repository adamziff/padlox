'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'
import { CameraCapture } from '@/components/camera-capture'
import { MediaPreview } from '@/components/media-preview'
import { AssetModal } from '@/components/asset-modal'
import { uploadToS3 } from '@/utils/s3'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/format'
import { Asset } from '@/types/asset'
import { AssetWithMuxData } from '@/types/mux'
import { TrashIcon, ImageIcon, VideoIcon, SpinnerIcon } from '@/components/icons'
import { NavBar } from '@/components/nav-bar'
import { generateVideoPoster } from '@/utils/video'
import { User } from '@supabase/supabase-js'

type DashboardClientProps = {
    initialAssets: AssetWithMuxData[]
    user: User
}

export function DashboardClient({ initialAssets, user }: DashboardClientProps) {
    const [showCamera, setShowCamera] = useState(false)
    const [capturedFile, setCapturedFile] = useState<File | null>(null)
    const [assets, setAssets] = useState<AssetWithMuxData[]>(initialAssets)
    const [selectedAsset, setSelectedAsset] = useState<AssetWithMuxData | null>(null)
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({})
    const [videoPosterUrls, setVideoPosterUrls] = useState<Record<string, string | null>>({})
    const supabase = createClient()

    async function handleCapture(file: File) {
        try {
            // If the file is a video, we upload it to Mux directly
            if (file.type.startsWith('video/')) {
                // Close the camera and show dashboard immediately
                setShowCamera(false);

                // Create a basic metadata object with a more descriptive name
                const metadata = {
                    name: `Video - ${new Date().toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric',
                        hour12: true
                    })}`,
                    description: null,
                    estimated_value: null
                };

                console.log('Requesting Mux upload URL with metadata:', metadata);

                // Get a direct upload URL from Mux
                const response = await fetch('/api/mux/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ metadata }),
                });

                // Try to get the error details from the response
                let errorData: any = {};
                let errorDetail = '';

                if (!response.ok) {
                    try {
                        errorData = await response.json();
                        console.error('Upload error details:', errorData);
                        errorDetail = errorData.details ? ` - ${errorData.details}` : '';
                    } catch (e) {
                        console.error('Failed to parse error response:', e);
                    }

                    throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}${errorDetail}`);
                }

                // Parse the successful response
                let responseData;
                try {
                    responseData = await response.json();
                    console.log('Got upload URL response:', responseData);
                } catch (parseError) {
                    console.error('Error parsing upload response:', parseError);
                    throw new Error('Failed to parse upload response');
                }

                const { uploadUrl, asset } = responseData;

                if (!uploadUrl) {
                    throw new Error('No upload URL returned from the server');
                }

                // Add the pending asset to the UI immediately
                if (asset) {
                    console.log('Adding asset to UI:', asset);
                    setAssets(prev => [asset, ...prev]);
                } else {
                    console.warn('No asset data returned from server');
                }

                // Upload the file to Mux
                console.log('Uploading video to Mux URL:', uploadUrl, 'file type:', file.type, 'file size:', file.size);

                try {
                    const uploadResponse = await fetch(uploadUrl, {
                        method: 'PUT',
                        body: file,
                        headers: {
                            'Content-Type': file.type,
                        },
                    });

                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text().catch(() => '');
                        throw new Error(`Failed to upload to Mux: ${uploadResponse.status} ${uploadResponse.statusText}${errorText ? ` - ${errorText}` : ''}`);
                    }

                    console.log('Video successfully sent to Mux for processing');
                } catch (uploadError) {
                    console.error('Error during file upload to Mux:', uploadError);
                    alert(`Error uploading video: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
                    // Even if upload fails, we keep the asset in preparing state - it might timeout later
                }
            } else {
                // For images, we follow the normal flow
                setCapturedFile(file);
                setShowCamera(false);
            }
        } catch (error) {
            console.error('Error handling capture:', error);
            alert(error instanceof Error ? error.message : 'Failed to process capture. Please try again.');
            setShowCamera(false);
        }
    }

    async function handleSave(url: string, metadata: {
        name: string
        description: string | null
        estimated_value: number | null
    }) {
        try {
            if (!capturedFile) {
                console.error('No file captured')
                return
            }

            console.log('Uploading file to S3...')
            const response = await uploadToS3(capturedFile)
            const { url: s3Url, key } = response
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
            } as AssetWithMuxData;

            console.log('Asset saved successfully:', transformedAsset)
            setAssets(prev => [transformedAsset, ...prev])
            setCapturedFile(null)
        } catch (error: unknown) {
            const err = error as Error & {
                details?: string
                hint?: string
                code?: string
                name?: string
            }
            console.error('Error saving asset:', {
                message: err?.message,
                details: err?.details,
                stack: err?.stack,
                name: err?.name
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

    function handleAssetClick(asset: AssetWithMuxData, event: React.MouseEvent) {
        if (isSelectionMode) {
            toggleAssetSelection(asset.id, event)
        } else {
            setSelectedAsset(asset)
        }
    }

    async function handleAssetDeleted(deletedAssetId: string) {
        setAssets(prevAssets => prevAssets.filter(asset => asset.id !== deletedAssetId));
    }

    // Process any pending webhook events for this user's videos
    async function processPendingWebhooks() {
        try {
            const { data, error } = await supabase.rpc('update_user_videos_from_webhooks');

            if (error) {
                console.error('Error processing webhook events:', error);
                alert('Error processing videos: Could not process pending webhook events.');
                return;
            }

            const fixedCount = data?.fixed_count || 0;

            if (fixedCount > 0) {
                console.log(`Processed ${fixedCount} webhook events`);
                alert(`Videos updated: Processed ${fixedCount} pending video${fixedCount === 1 ? '' : 's'}`);

                // Refresh the asset list
                const { data: updatedAssets, error: refreshError } = await supabase
                    .from('assets')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (!refreshError && updatedAssets) {
                    setAssets(updatedAssets as AssetWithMuxData[]);

                    // Clear any media errors that might have been set on videos that are now ready
                    const updatedMediaErrors = { ...mediaErrors };
                    let hasChanges = false;

                    updatedAssets.forEach(asset => {
                        // Clear errors for any Mux videos that are now ready
                        if (asset.media_type === 'video' &&
                            'mux_processing_status' in asset &&
                            asset.mux_processing_status === 'ready' &&
                            updatedMediaErrors[asset.id]) {
                            delete updatedMediaErrors[asset.id];
                            hasChanges = true;
                        }
                    });

                    if (hasChanges) {
                        setMediaErrors(updatedMediaErrors);
                    }

                    // If there's a selected asset, refresh it with the latest data
                    if (selectedAsset) {
                        const updatedSelectedAsset = updatedAssets.find(a => a.id === selectedAsset.id);
                        if (updatedSelectedAsset) {
                            setSelectedAsset(updatedSelectedAsset as AssetWithMuxData);
                        }
                    }
                }
            } else {
                // No need to show an alert for 0 processed
                console.log('No pending webhook events to process');
            }
        } catch (error) {
            console.error('Error in processPendingWebhooks:', error);
        }
    }

    // Add function to handle media errors
    function handleMediaError(assetId: string, url: string, type: 'image' | 'video', error: unknown) {
        console.error(`Error loading ${type}:`, {
            assetId,
            url,
            error,
            timestamp: new Date().toISOString()
        })
        setMediaErrors(prev => ({ ...prev, [assetId]: true }))
    }

    // Add function to generate and cache video posters
    async function generateAndCacheVideoPoster(assetId: string, videoUrl: string) {
        try {
            // Skip Mux videos - they need authentication and we handle them differently
            const asset = assets.find(a => a.id === assetId);
            if (asset?.mux_playback_id) {
                // Return null to indicate we're not generating a poster for this
                return null;
            }

            // Only proceed for direct video URLs
            console.log(`Generating poster for video: ${assetId}`);

            // Don't attempt to generate posters for Mux streams (they need auth)
            if (videoUrl.includes('stream.mux.com')) {
                console.log('Skipping poster generation for Mux stream');
                return null;
            }

            // Mark as in progress
            setVideoPosterUrls(prev => ({
                ...prev,
                [assetId]: null // null indicates in progress
            }));

            // Get a poster image from the video
            const poster = await generateVideoPoster(videoUrl);

            // Cache the poster URL
            setVideoPosterUrls(prev => ({
                ...prev,
                [assetId]: poster
            }));

            return poster;
        } catch (error) {
            console.error('Error generating video poster:', error);
            throw error;
        }
    }

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />
            <div className="container mx-auto p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <h1 className="text-2xl font-bold text-foreground">My Assets</h1>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                        {assets.length > 0 && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsSelectionMode(!isSelectionMode)
                                    setSelectedAssets(new Set())
                                }}
                                className="w-full sm:w-auto"
                            >
                                {isSelectionMode ? 'Cancel Selection' : 'Select Multiple'}
                            </Button>
                        )}
                        {isSelectionMode && selectedAssets.size > 0 && (
                            <Button
                                variant="destructive"
                                onClick={handleBulkDelete}
                                disabled={isDeleting}
                                className="w-full sm:w-auto"
                            >
                                <TrashIcon className="h-4 w-4 mr-2" />
                                Delete Selected ({selectedAssets.size})
                            </Button>
                        )}
                        <Button
                            onClick={() => setShowCamera(true)}
                            className="w-full sm:w-auto"
                        >
                            Add New Asset
                        </Button>
                        <Button
                            variant="outline"
                            onClick={processPendingWebhooks}
                        >
                            Process Pending Videos
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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                    {assets.map(asset => {
                        const isProcessing = asset.mux_processing_status === 'preparing';

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

                                {isProcessing ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="animate-spin h-10 w-10 mx-auto mb-2">
                                                <SpinnerIcon />
                                            </div>
                                            <p className="text-sm text-muted-foreground">Video analysis in progress...</p>
                                        </div>
                                    </div>
                                ) : mediaErrors[asset.id] ? (
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
                                    <div className="relative w-full h-full">
                                        {videoPosterUrls[asset.id] === null && !mediaErrors[asset.id] && !asset.mux_playback_id && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-10">
                                                <div className="text-white text-sm">Loading preview...</div>
                                            </div>
                                        )}

                                        {/* For Mux videos - display a placeholder with a play icon */}
                                        {asset.mux_playback_id ? (
                                            <div className="relative w-full h-full bg-black flex items-center justify-center">
                                                {/* Display a thumbnail with play icon */}
                                                <div className="w-12 h-12 bg-primary/80 rounded-full flex items-center justify-center">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polygon points="5 3 19 12 5 21 5 3" />
                                                    </svg>
                                                </div>

                                                {/* Status indicator */}
                                                {asset.mux_processing_status !== 'ready' && (
                                                    <div className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-1">
                                                        <span className="text-xs text-white">Processing</span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : asset.media_url ? (
                                            /* For direct video URLs - only for non-Mux videos */
                                            <video
                                                key={`${asset.media_url}-${mediaErrors[asset.id] ? 'retry' : 'initial'}`}
                                                src={asset.media_url}
                                                className="w-full h-full object-cover"
                                                poster={videoPosterUrls[asset.id] || undefined}
                                                onLoadedMetadata={() => {
                                                    if (videoPosterUrls[asset.id] === null) {
                                                        generateAndCacheVideoPoster(asset.id, asset.media_url)
                                                            .catch(() => {
                                                                // Silently fail - we'll still show the video
                                                                setVideoPosterUrls(prev => ({
                                                                    ...prev,
                                                                    [asset.id]: null // null indicates we tried and failed
                                                                }));
                                                            });
                                                    }
                                                }}
                                                onError={(e) => {
                                                    const target = e.target as HTMLVideoElement;
                                                    // Only show error if we haven't successfully loaded a poster
                                                    if (videoPosterUrls[asset.id] === null) {
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
                                                        );
                                                    }
                                                }}
                                                preload="metadata"
                                                muted
                                                playsInline
                                                controlsList="nodownload"
                                                webkit-playsinline="true"
                                                x-webkit-airplay="allow"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full bg-muted">
                                                <div className="animate-pulse h-full w-full bg-muted-foreground/20"></div>
                                            </div>
                                        )}
                                        <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1.5">
                                            <VideoIcon size={14} />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <Image
                                            key={`${asset.media_url}-${mediaErrors[asset.id] ? 'retry' : 'initial'}`}
                                            src={asset.media_url}
                                            alt={asset.name}
                                            fill
                                            className="object-cover"
                                            onError={() => {
                                                handleMediaError(
                                                    asset.id,
                                                    asset.media_url,
                                                    'image',
                                                    {
                                                        complete: false,
                                                        naturalWidth: 0,
                                                        naturalHeight: 0
                                                    }
                                                )
                                            }}
                                            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            priority={false}
                                        />
                                        <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1.5">
                                            <ImageIcon size={14} />
                                        </div>
                                    </>
                                )}

                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 sm:p-4">
                                    <h3 className="text-white font-medium truncate text-sm sm:text-base">
                                        {asset.name}
                                    </h3>
                                    {asset.estimated_value && (
                                        <p className="text-white/90 text-xs sm:text-sm">
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
        </div>
    )
} 