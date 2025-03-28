import { Asset } from '@/types/asset'
import { AssetWithMuxData } from '@/types/mux'
import Image from 'next/image'
import { Button } from './ui/button'
import { formatCurrency } from '@/utils/format'
import { CrossIcon, TrashIcon, DownloadIcon } from './icons'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { MuxPlayer } from './mux-player'

interface AssetModalProps {
    asset: Asset | AssetWithMuxData
    onClose: () => void
    onDelete?: (id: string) => void
}

export function AssetModal({ asset: initialAsset, onClose, onDelete }: AssetModalProps) {
    // Track the asset state internally to handle real-time updates
    const [asset, setAsset] = useState<Asset | AssetWithMuxData>(initialAsset)
    const [isDeleting, setIsDeleting] = useState(false)
    const isVideo = asset.media_type === 'video'
    const supabase = createClient()

    // Check if asset has Mux data
    const hasMuxData = 'mux_playback_id' in asset && asset.mux_playback_id
    const isMuxProcessing = 'mux_processing_status' in asset && asset.mux_processing_status === 'preparing'
    const isMuxReady = 'mux_processing_status' in asset && asset.mux_processing_status === 'ready'

    // Set up a real-time subscription to update this asset if it changes
    useEffect(() => {
        console.log(`Setting up realtime subscription for asset: ${asset.id}`);

        // Subscribe to changes on this specific asset
        const channel = supabase
            .channel(`asset-${asset.id}-changes`)
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'assets',
                    filter: `id=eq.${asset.id}`
                },
                (payload) => {
                    console.log('Asset modal received postgres update:',
                        'for asset:', asset.id,
                        'new status:', (payload.new as { mux_processing_status?: string })?.mux_processing_status,
                        'old status:', (payload.old as { mux_processing_status?: string })?.mux_processing_status);

                    // Create a fresh copy to ensure all properties are updated
                    const updatedAsset = { ...payload.new } as AssetWithMuxData;

                    // Update our local state with the changes
                    setAsset(updatedAsset);
                }
            )
            .on('broadcast', { event: 'asset-ready' }, (payload) => {
                console.log('Asset modal received broadcast for asset:', payload);

                // Check if the broadcast is for this asset
                if (payload.payload && payload.payload.id === asset.id) {
                    // Fetch the latest asset data
                    supabase
                        .from('assets')
                        .select('*')
                        .eq('id', asset.id)
                        .single()
                        .then(({ data, error }) => {
                            if (!error && data) {
                                console.log('Updated asset data from broadcast:', data);
                                setAsset(data as AssetWithMuxData);
                            }
                        });
                }
            })
            .subscribe((status) => {
                console.log(`Asset subscription status for ${asset.id}:`, status);
            });

        // Set up a periodic check for asset updates
        let refreshTimer: NodeJS.Timeout | null = null;

        // Only set up the timer for processing assets
        if (isMuxProcessing) {
            console.log(`Setting up refresh timer for processing asset: ${asset.id}`);

            refreshTimer = setInterval(() => {
                console.log(`Checking status for asset: ${asset.id}`);

                supabase
                    .from('assets')
                    .select('*')
                    .eq('id', asset.id)
                    .single()
                    .then(({ data, error }) => {
                        if (!error && data) {
                            const freshAsset = data as AssetWithMuxData;

                            // Only update if processing status changed
                            if ('mux_processing_status' in freshAsset &&
                                'mux_processing_status' in asset &&
                                freshAsset.mux_processing_status !== asset.mux_processing_status) {

                                console.log(`Manual refresh detected status change: ${asset.mux_processing_status} -> ${freshAsset.mux_processing_status}`);
                                setAsset(freshAsset);

                                // If asset is ready, clear the timer
                                if (freshAsset.mux_processing_status === 'ready') {
                                    if (refreshTimer) {
                                        clearInterval(refreshTimer);
                                        refreshTimer = null;
                                    }
                                }
                            }
                        }
                    });
            }, 5000); // Check every 5 seconds
        }

        // Cleanup on unmount
        return () => {
            console.log(`Cleaning up realtime subscription for asset: ${asset.id}`);
            channel.unsubscribe();

            if (refreshTimer) {
                clearInterval(refreshTimer);
            }
        };
    }, [asset.id, supabase, isMuxProcessing, asset]);

    // Update the asset when initialAsset changes (e.g., from parent component)
    useEffect(() => {
        setAsset(initialAsset);
    }, [initialAsset]);

    // Log asset state for debugging
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            console.log('Asset Modal - Current Asset State:', {
                id: asset.id,
                type: asset.media_type,
                hasMuxData,
                isMuxProcessing,
                isMuxReady,
                playbackId: 'mux_playback_id' in asset ? asset.mux_playback_id : 'N/A',
                status: 'mux_processing_status' in asset ? asset.mux_processing_status : 'N/A'
            });
        }
    }, [asset, hasMuxData, isMuxProcessing, isMuxReady]);

    async function handleDelete() {
        if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
            return
        }

        setIsDeleting(true)
        try {
            if (hasMuxData) {
                // Delete using the Mux API endpoint
                const response = await fetch('/api/mux/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ assetId: asset.id }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to delete Mux asset');
                }
            } else {
                // For non-Mux assets, delete from Supabase and S3
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

            onDelete?.(asset.id)
            onClose()
        } catch (error) {
            console.error('Error deleting asset:', error)
            alert('Failed to delete asset. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    async function handleDownload() {
        try {
            // For Mux videos, we can't easily provide direct downloads
            if (hasMuxData) {
                alert('Direct download from Mux is not currently supported.');
                return;
            }

            // Send the full media URL to let the server handle key extraction
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    key: asset.media_url,
                    filename: `${asset.name}${asset.media_type === 'video' ? '.mp4' : '.jpg'}`
                }),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({ details: 'Failed to download file' }))
                throw new Error(error.details || 'Failed to download file')
            }

            // Check content type to ensure we received the file
            const contentType = response.headers.get('Content-Type')
            if (!contentType || (!contentType.includes('video') && !contentType.includes('image'))) {
                throw new Error('Invalid response type received')
            }

            const blob = await response.blob()
            if (blob.size === 0) {
                throw new Error('Received empty file')
            }

            // Create and trigger download
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${asset.name}${asset.media_type === 'video' ? '.mp4' : '.jpg'}`
            document.body.appendChild(a)
            a.click()

            // Cleanup
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (error) {
            console.error('Error downloading asset:', error)
            alert(error instanceof Error ? error.message : 'Failed to download asset. Please try again.')
        }
    }

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" role="dialog" aria-label="Asset Details" aria-modal="true">
                <div className="fixed inset-[50%] w-full max-w-3xl h-[90vh] translate-x-[-50%] translate-y-[-50%] bg-background rounded-lg shadow-lg flex flex-col">
                    <div className="flex justify-between items-center p-4 border-b">
                        <h2 className="text-xl font-semibold">{asset.name}</h2>
                        <div className="flex items-center gap-2">
                            {/* Only show download button for images, not videos */}
                            {asset.media_type === 'image' && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleDownload}
                                    aria-label="Download asset"
                                >
                                    <DownloadIcon />
                                </Button>
                            )}
                            <Button
                                variant="destructive"
                                size="icon"
                                onClick={handleDelete}
                                aria-label="Delete asset"
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
                                ) : (
                                    <TrashIcon className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                aria-label="Close asset details"
                            >
                                <CrossIcon />
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Media */}
                            <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                                {isVideo ? (
                                    hasMuxData && isMuxReady && asset.mux_playback_id ? (
                                        // Use MuxPlayer for Mux videos that are ready
                                        <MuxPlayer
                                            playbackId={asset.mux_playback_id}
                                            title={asset.name}
                                            aspectRatio={asset.mux_aspect_ratio || '16/9'}
                                        />
                                    ) : isMuxProcessing ? (
                                        // Show a loading indicator for Mux videos still processing
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            <div className="text-center p-4">
                                                <div className="animate-spin h-10 w-10 mx-auto mb-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                                    </svg>
                                                </div>
                                                <p>Video is still processing...</p>
                                                <p className="text-xs mt-2 text-muted-foreground">This may take a few minutes</p>
                                            </div>
                                        </div>
                                    ) : (
                                        // Only render video tag if there's a valid URL and it's not a Mux video
                                        asset.media_url ? (
                                            <video
                                                src={asset.media_url}
                                                controls
                                                className="w-full h-full object-contain"
                                                playsInline
                                                preload="metadata"
                                                controlsList="nodownload"
                                                webkit-playsinline="true"
                                                x-webkit-airplay="allow"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                                <div className="text-center p-4">
                                                    <p>Video is not available</p>
                                                </div>
                                            </div>
                                        )
                                    )
                                ) : (
                                    // Only render image if there's a valid URL
                                    asset.media_url ? (
                                        <div className="relative w-full h-full">
                                            <Image
                                                src={asset.media_url}
                                                alt={asset.name}
                                                fill
                                                className="object-contain"
                                                sizes="(max-width: 768px) 100vw, 50vw"
                                                priority
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">
                                            <p>Image is not available</p>
                                        </div>
                                    )
                                )}
                            </div>

                            {/* Details */}
                            <div className="space-y-4">
                                {asset.description && (
                                    <div>
                                        <h3 className="font-medium mb-2">Description</h3>
                                        <p className="text-muted-foreground whitespace-pre-line">{asset.description}</p>
                                    </div>
                                )}

                                {asset.estimated_value && (
                                    <div>
                                        <h3 className="font-medium mb-2">Estimated Value</h3>
                                        <p className="text-muted-foreground">
                                            {formatCurrency(asset.estimated_value)}
                                        </p>
                                    </div>
                                )}

                                {/* Show Mux metadata if available */}
                                {'mux_processing_status' in asset && asset.mux_processing_status && (
                                    <div>
                                        <h3 className="font-medium mb-2">Video Status</h3>
                                        <p className="text-muted-foreground">
                                            {asset.mux_processing_status === 'preparing'
                                                ? 'Processing (please wait)'
                                                : asset.mux_processing_status === 'ready'
                                                    ? 'Ready'
                                                    : 'Error'}
                                        </p>
                                    </div>
                                )}

                                {'mux_max_resolution' in asset && asset.mux_max_resolution && (
                                    <div>
                                        <h3 className="font-medium mb-2">Video Resolution</h3>
                                        <p className="text-muted-foreground">
                                            {asset.mux_max_resolution}
                                        </p>
                                    </div>
                                )}

                                {'mux_duration' in asset && asset.mux_duration && (
                                    <div>
                                        <h3 className="font-medium mb-2">Duration</h3>
                                        <p className="text-muted-foreground">
                                            {Math.floor(asset.mux_duration / 60)}m {Math.round(asset.mux_duration % 60)}s
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <h3 className="font-medium mb-2">Added On</h3>
                                    <p className="text-muted-foreground">
                                        {new Date(asset.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
} 