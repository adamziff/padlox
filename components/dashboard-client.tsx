'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { CameraCaptureWrapper } from './camera-capture-wrapper'
import { MediaPreview } from './media-preview'
import { AssetModal } from './asset-modal'
import { uploadToS3 } from '@/utils/s3'
import { Button } from './ui/button'
import { formatCurrency } from '@/utils/format'
import { AssetWithMuxData } from '@/types/mux'
import { TrashIcon, ImageIcon, VideoIcon, SpinnerIcon } from './icons'
import { NavBar } from '@/components/nav-bar'
import { generateVideoPoster } from '@/utils/video'
import { User } from '@supabase/supabase-js'
import { getMuxThumbnailUrl } from '@/lib/mux'

type DashboardClientProps = {
    initialAssets: AssetWithMuxData[]
    user: User
}

// Upload notification type
type ActiveUpload = {
    assetId: string;
    status: 'uploading' | 'processing' | 'transcribing' | 'complete' | 'error';
    message: string;
    startTime: number;
}

export function DashboardClient({ initialAssets, user }: DashboardClientProps) {
    const [showCamera, setShowCamera] = useState(false)
    const [capturedFile, setCapturedFile] = useState<File | null>(null)
    const [assets, setAssets] = useState<AssetWithMuxData[]>(initialAssets)
    const [selectedAsset, setSelectedAsset] = useState<AssetWithMuxData | null>(null)
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({})
    const [videoPosterUrls, setVideoPosterUrls] = useState<Record<string, string | null>>({})
    const [thumbnailTokens, setThumbnailTokens] = useState<Record<string, string>>({})
    const [activeUploads, setActiveUploads] = useState<Record<string, ActiveUpload>>({})

    const supabase = createClient()

    // Fetch thumbnail token for Mux videos
    const fetchThumbnailToken = useCallback(async (playbackId: string) => {
        try {
            const response = await fetch(`/api/mux/token?playbackId=${playbackId}&_=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Failed to get token: ${response.status}`);
            }

            const data = await response.json();
            if (data.tokens?.thumbnail) {
                setThumbnailTokens(prev => ({
                    ...prev,
                    [playbackId]: data.tokens.thumbnail
                }));
                return data.tokens.thumbnail;
            }
            return null;
        } catch (err) {
            console.error('Error fetching thumbnail token:', err);
            return null;
        }
    }, []);

    // Setup realtime subscription for assets
    useEffect(() => {
        const channel = supabase
            .channel('assets-changes')
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'assets',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    // Handle INSERT events (covers both videos and new items)
                    if (payload.eventType === 'INSERT') {
                        const newAsset = payload.new as AssetWithMuxData;
                        console.log(`[REALTIME UPDATE] New asset inserted: ${newAsset.id}, type: ${newAsset.media_type}, is_source: ${newAsset.is_source_video}`);
                        // Add to the beginning of the list
                        setAssets(prevAssets => [
                            newAsset,
                            ...prevAssets.filter(a => a.id !== newAsset.id) // Avoid duplicates if already present
                        ]);
                    }
                    // Handle UPDATE events
                    else if (payload.eventType === 'UPDATE') {
                        const updatedAsset = payload.new as AssetWithMuxData;
                        const oldAsset = payload.old as AssetWithMuxData;

                        // Log what changed
                        const changes = Object.keys(updatedAsset)
                            .filter(key => updatedAsset[key as keyof AssetWithMuxData] !== oldAsset[key as keyof AssetWithMuxData])
                            .map(key => `${key}: ${oldAsset[key as keyof AssetWithMuxData]} → ${updatedAsset[key as keyof AssetWithMuxData]}`)
                            .join(', ');
                        console.log(
                            `[REALTIME UPDATE] Asset ${updatedAsset.id} updated: ${changes}`
                        );

                        // Handle Mux status updates
                        if ('mux_processing_status' in updatedAsset && 'mux_processing_status' in oldAsset &&
                            updatedAsset.mux_processing_status !== oldAsset.mux_processing_status) {

                            if (updatedAsset.mux_processing_status === 'ready') {
                                // Clear relevant upload notifications
                                setActiveUploads(prev => {
                                    const newUploads = { ...prev };
                                    Object.keys(newUploads).forEach(uploadId => {
                                        if (newUploads[uploadId].assetId === updatedAsset.id) {
                                            // If transcript processing is pending/processing, change status
                                            if (updatedAsset.transcript_processing_status === 'pending' || updatedAsset.transcript_processing_status === 'processing') {
                                                newUploads[uploadId].status = 'transcribing';
                                                newUploads[uploadId].message = 'Video ready. Generating transcript...';
                                            } else {
                                                // Otherwise, remove the notification
                                                delete newUploads[uploadId];
                                            }
                                        }
                                    });
                                    return newUploads;
                                });

                                // Fetch thumbnail token if needed
                                if (updatedAsset.mux_playback_id && !thumbnailTokens[updatedAsset.mux_playback_id]) {
                                    fetchThumbnailToken(updatedAsset.mux_playback_id);
                                }
                            }
                        }

                        // Handle transcript status updates
                        if ('transcript_processing_status' in updatedAsset && 'transcript_processing_status' in oldAsset &&
                            updatedAsset.transcript_processing_status !== oldAsset.transcript_processing_status) {

                            console.log(
                                `[REALTIME UPDATE] Transcript status changed for asset ${updatedAsset.id}: `,
                                `${oldAsset.transcript_processing_status} → ${updatedAsset.transcript_processing_status}`
                            );

                            // If transcript completed or errored, clear related upload notifications
                            if (updatedAsset.transcript_processing_status === 'completed' || updatedAsset.transcript_processing_status === 'error') {
                                setActiveUploads(prev => {
                                    const newUploads = { ...prev };
                                    Object.keys(newUploads).forEach(uploadId => {
                                        if (newUploads[uploadId].assetId === updatedAsset.id &&
                                            newUploads[uploadId].status === 'transcribing') {
                                            delete newUploads[uploadId];
                                        }
                                    });
                                    return newUploads;
                                });
                            }
                        }

                        // Update the asset in the main list
                        setAssets(prevAssets =>
                            prevAssets.map(asset =>
                                asset.id === updatedAsset.id ? updatedAsset : asset
                            )
                        );

                        // Update selectedAsset if it's the one being viewed in the modal
                        if (selectedAsset && selectedAsset.id === updatedAsset.id) {
                            console.log('[REALTIME UPDATE] Also updating currently selected asset in modal');
                            setSelectedAsset(updatedAsset);
                        }

                        // Clear any media errors for this asset upon successful update
                        if (mediaErrors[updatedAsset.id]) {
                            setMediaErrors(prev => {
                                const next = { ...prev };
                                delete next[updatedAsset.id];
                                return next;
                            });
                        }
                    }
                    // Handle DELETE events (covers both videos and items)
                    else if (payload.eventType === 'DELETE') {
                        const deletedAssetId = payload.old.id;
                        console.log('[REALTIME UPDATE] Asset deleted:', deletedAssetId);
                        setAssets(prevAssets =>
                            prevAssets.filter(asset => asset.id !== deletedAssetId)
                        );
                        // If the selected asset was deleted, close the modal
                        if (selectedAsset && selectedAsset.id === deletedAssetId) {
                            setSelectedAsset(null);
                        }
                        // Remove from selection if present
                        if (selectedAssets.has(deletedAssetId)) {
                            setSelectedAssets(prev => {
                                const next = new Set(prev);
                                next.delete(deletedAssetId);
                                return next;
                            });
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log(`Assets realtime subscription status: ${status}`);
                if (status === 'SUBSCRIBED') {
                    // Ensure we fetch latest state on successful subscription reconnection
                    // fetchInitialAssets(); // You might need a function to refetch all assets
                }
            });

        // Periodically check preparing assets (fallback for when real-time updates fail)
        const checkInterval = setInterval(() => {
            const preparingAssets = assets.filter(
                asset => asset.mux_processing_status === 'preparing' && asset.mux_asset_id
            );

            if (preparingAssets.length > 0) {
                console.log('[POLLING] Checking status of preparing assets:', preparingAssets.length);

                preparingAssets.forEach(asset => {
                    // Check once every 30 seconds per asset
                    const lastCheckedKey = `last_checked_${asset.id}`;
                    const lastChecked = parseInt(localStorage.getItem(lastCheckedKey) || '0', 10);
                    const now = Date.now();

                    if (now - lastChecked > 30000) {
                        console.log(`[POLLING] Checking asset ${asset.id} (last checked ${Math.floor((now - lastChecked) / 1000)}s ago)`);
                        localStorage.setItem(lastCheckedKey, now.toString());

                        // Fetch the latest status from the API
                        supabase
                            .from('assets')
                            .select('*')
                            .eq('id', asset.id)
                            .single()
                            .then(({ data, error }) => {
                                if (!error && data) {
                                    const updatedAsset = data as AssetWithMuxData;

                                    // If status changed, update the asset
                                    if (updatedAsset.mux_processing_status !== asset.mux_processing_status) {
                                        console.log(
                                            `[POLLING UPDATE] Asset ${asset.id} status changed:`,
                                            `${asset.mux_processing_status} → ${updatedAsset.mux_processing_status}`
                                        );

                                        setAssets(prevState =>
                                            prevState.map(a =>
                                                a.id === asset.id ? updatedAsset : a
                                            )
                                        );

                                        // Update selected asset if needed
                                        if (selectedAsset && selectedAsset.id === asset.id) {
                                            console.log('[POLLING UPDATE] Also updating currently selected asset');
                                            setSelectedAsset(updatedAsset);
                                        }
                                    } else {
                                        console.log(`[POLLING] No change for asset ${asset.id}, still ${asset.mux_processing_status}`);
                                    }
                                }
                            });
                    }
                });
            }
        }, 15000);

        // Clean up on unmount
        return () => {
            channel.unsubscribe();
            clearInterval(checkInterval);
        };
    }, [user.id, selectedAsset, mediaErrors, thumbnailTokens, fetchThumbnailToken, supabase, activeUploads, assets, selectedAssets]);

    // Handle captured media files
    async function handleCapture(file: File) {
        try {
            // For videos, use Mux upload flow
            if (file.type.startsWith('video/')) {
                // Close the camera and show dashboard immediately
                setShowCamera(false);

                // Create a unique upload ID for tracking
                const uploadId = `upload_${Date.now()}`;

                // Show the upload notification
                setActiveUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        assetId: '',  // Will set this after response
                        status: 'uploading',
                        message: 'Uploading video to server... Please do not refresh until upload completes.',
                        startTime: Date.now()
                    }
                }));

                // Create a correlation ID to track this upload across page refreshes
                const correlationId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

                // Basic metadata for the video
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

                // Get a direct upload URL from Mux
                const response = await fetch('/api/mux/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        metadata,
                        correlationId
                    }),
                });

                if (!response.ok) {
                    throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
                }

                // Parse the successful response
                const responseData = await response.json();
                const { uploadUrl, asset, clientReferenceId } = responseData;

                if (!uploadUrl) {
                    throw new Error('No upload URL returned from the server');
                }

                // After getting response, update the upload tracking
                if (asset) {
                    // Store the reference ID for recovery if page refreshes
                    if (clientReferenceId) {
                        try {
                            localStorage.setItem('lastUploadReference', clientReferenceId);
                            localStorage.setItem('lastUploadTime', Date.now().toString());
                        } catch (e) {
                            console.warn('Could not store upload reference in localStorage:', e);
                        }
                    }

                    // Add asset to UI
                    setAssets(prev => [asset, ...prev]);

                    // Update the notification with asset ID
                    setActiveUploads(prev => ({
                        ...prev,
                        [uploadId]: {
                            ...prev[uploadId],
                            assetId: asset.id,
                            status: 'processing',
                            message: 'Video uploaded. Processing is happening in the background - you can continue using the app.'
                        }
                    }));
                }

                // Upload the file to Mux
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        'Content-Type': file.type,
                    },
                });

                if (!uploadResponse.ok) {
                    throw new Error(`Failed to upload to Mux: ${uploadResponse.status} ${uploadResponse.statusText}`);
                }
            } else {
                // For images, show the media preview
                setCapturedFile(file);
                setShowCamera(false);
            }
        } catch (error) {
            // On error, update the upload status
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Find the active upload and mark it as error
            const uploadIds = Object.keys(activeUploads);
            if (uploadIds.length > 0) {
                const latestUploadId = uploadIds[uploadIds.length - 1];

                setActiveUploads(prev => ({
                    ...prev,
                    [latestUploadId]: {
                        ...prev[latestUploadId],
                        status: 'error',
                        message: `Error: ${errorMessage}`
                    }
                }));

                // Remove the error after 5 seconds
                setTimeout(() => {
                    setActiveUploads(prev => {
                        const newUploads = { ...prev };
                        delete newUploads[latestUploadId];
                        return newUploads;
                    });
                }, 5000);
            }

            console.error('Error handling capture:', error);
            alert(error instanceof Error ? error.message : 'Failed to process capture. Please try again.');
            setShowCamera(false);
        }
    }

    // Add a recovery mechanism for uploads after page refresh
    useEffect(() => {
        try {
            const lastUploadReference = localStorage.getItem('lastUploadReference');
            const lastUploadTime = localStorage.getItem('lastUploadTime');

            // Only attempt recovery for recent uploads (within the last hour)
            if (lastUploadReference && lastUploadTime) {
                const timeSinceUpload = Date.now() - Number(lastUploadTime);
                if (timeSinceUpload < 3600000) { // 1 hour
                    // Check if this upload is already in our assets list
                    const existingAsset = assets.find(a =>
                        'client_reference_id' in a && a.client_reference_id === lastUploadReference
                    );

                    if (!existingAsset) {
                        // The asset might exist in the database but not in our current state
                        supabase
                            .from('assets')
                            .select('*')
                            .eq('client_reference_id', lastUploadReference)
                            .eq('user_id', user.id)
                            .single()
                            .then(({ data, error }) => {
                                if (data && !error) {
                                    setAssets(prev => {
                                        // Check if it's already been added
                                        if (prev.some(a => a.id === data.id)) {
                                            return prev;
                                        }
                                        return [data as AssetWithMuxData, ...prev];
                                    });
                                } else if (error) {
                                    // No existing upload found, clear recovery data
                                    localStorage.removeItem('lastUploadReference');
                                    localStorage.removeItem('lastUploadTime');
                                }
                            });
                    }
                } else {
                    // Upload is too old, clear the recovery data
                    localStorage.removeItem('lastUploadReference');
                    localStorage.removeItem('lastUploadTime');
                }
            }
        } catch (e) {
            console.warn('Error checking for upload recovery:', e);
        }
    }, [assets, supabase, user.id]);

    // Handle saving images uploaded via the camera
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

            // Upload to S3 with metadata
            const response = await uploadToS3(capturedFile, metadata)
            const { key } = response

            // Save to database
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
                throw error
            }

            // Transform the asset to include the full S3 URL
            const transformedAsset = {
                ...asset,
                media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`
            } as AssetWithMuxData;

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

    // Handle asset selection for multi-select mode
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

    // Handle bulk delete of selected assets
    async function handleBulkDelete() {
        if (!window.confirm(`Are you sure you want to delete ${selectedAssets.size} assets? This action cannot be undone.`)) {
            return
        }

        setIsDeleting(true)
        const assetsToDeleteIds = Array.from(selectedAssets);
        const assetsToDelete = assets.filter(asset => assetsToDeleteIds.includes(asset.id));
        let errors: { id: string, error: string }[] = [];

        console.log(`Attempting to bulk delete ${assetsToDelete.length} assets:`, assetsToDeleteIds);

        for (const asset of assetsToDelete) {
            try {
                console.log(`Processing deletion for asset ${asset.id}, type: ${asset.media_type}`);
                // Handle item deletion (DB only)
                if (asset.media_type === 'item') {
                    console.log(`Deleting item asset (DB only): ${asset.id}`);
                    const { error: dbError } = await supabase
                        .from('assets')
                        .delete()
                        .eq('id', asset.id);
                    if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                }
                // Handle Mux video deletion (uses API which handles DB too)
                else if (asset.media_type === 'video' && asset.mux_asset_id) {
                    console.log(`Deleting source Mux asset via API: ${asset.id}`);
                    const response = await fetch('/api/mux/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ assetId: asset.id }),
                    });
                    if (!response.ok) {
                        const data = await response.json().catch(() => ({}));
                        throw new Error(data.error || `Mux API delete failed (${response.status})`);
                    }
                }
                // Handle S3 image deletion
                else if (asset.media_type === 'image' && asset.media_url && !asset.mux_asset_id) {
                    console.log(`Deleting S3 image asset (DB & S3): ${asset.id}`);
                    // 1. Delete DB record first
                    const { error: dbError } = await supabase
                        .from('assets')
                        .delete()
                        .eq('id', asset.id);
                    if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);

                    // 2. Delete from S3
                    const key = asset.media_url.split('/').pop();
                    if (key) {
                        const response = await fetch('/api/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key }),
                        });
                        if (!response.ok) {
                            // Log S3 error but let UI proceed as DB record is gone
                            console.error(`Failed to delete S3 object for key ${key}, but DB record deleted.`);
                        }
                    } else {
                        console.warn(`Could not determine S3 key for asset ${asset.id}`);
                    }
                }
                // Handle unexpected cases
                else {
                    console.warn(`Unsupported asset type or state for deletion: ${asset.id}, type: ${asset.media_type}, mux: ${!!asset.mux_asset_id}`);
                    throw new Error('Unsupported asset type for deletion.');
                }
                console.log(`Successfully processed deletion for asset ${asset.id}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error deleting asset ${asset.id}:`, errorMessage);
                errors.push({ id: asset.id, error: errorMessage });
            }
        }

        // Update UI state - remove successfully deleted assets
        const successfulDeletes = assetsToDeleteIds.filter(id => !errors.some(e => e.id === id));
        if (successfulDeletes.length > 0) {
            setAssets(prev => prev.filter(asset => !successfulDeletes.includes(asset.id)));
        }

        setSelectedAssets(new Set()) // Clear selection regardless of errors
        setIsSelectionMode(false) // Exit selection mode
        setIsDeleting(false)

        if (errors.length > 0) {
            alert(`Failed to delete ${errors.length} asset(s). Please check the console for details.`);
        }
    }

    // Handle clicking on an asset
    function handleAssetClick(asset: AssetWithMuxData, event: React.MouseEvent) {
        // Don't process clicks on videos that are still processing
        if (asset.media_type === 'video' && asset.mux_processing_status === 'preparing') {
            return;
        }

        if (isSelectionMode) {
            toggleAssetSelection(asset.id, event)
        } else {
            setSelectedAsset(asset)
        }
    }

    // Handle asset deletion from the modal
    async function handleAssetDeleted(deletedAssetId: string) {
        setAssets(prevAssets => prevAssets.filter(asset => asset.id !== deletedAssetId));
    }

    // Handle media errors
    function handleMediaError(assetId: string, url: string, type: 'image' | 'video', error: unknown) {
        console.error(`Error loading ${type}:`, { assetId, url, error });
        setMediaErrors(prev => ({ ...prev, [assetId]: 'Failed to load media' }))
    }

    // Generate and cache video posters
    async function generateAndCacheVideoPoster(assetId: string, videoUrl: string): Promise<string | null> {
        try {
            // Skip Mux videos - they need authentication
            if (videoUrl.includes('stream.mux.com')) {
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
            return null;
        }
    }

    // Fetch thumbnail tokens for ready Mux videos
    useEffect(() => {
        const muxAssets = assets.filter(
            asset => asset.mux_playback_id &&
                asset.mux_processing_status === 'ready' &&
                !thumbnailTokens[asset.mux_playback_id]
        );

        muxAssets.forEach(asset => {
            if (asset.mux_playback_id) {
                fetchThumbnailToken(asset.mux_playback_id);
            }
        });
    }, [assets, thumbnailTokens, fetchThumbnailToken]);

    // Auto-dismiss processing notifications after 3 minutes
    useEffect(() => {
        const processingUploads = Object.entries(activeUploads).filter(
            ([, upload]) => upload.status === 'processing'
        );

        processingUploads.forEach(([uploadId, upload]) => {
            const elapsed = Date.now() - upload.startTime;
            const maxProcessingTime = 3 * 60 * 1000; // 3 minutes

            if (elapsed > maxProcessingTime) {
                setActiveUploads(prev => {
                    const newUploads = { ...prev };
                    delete newUploads[uploadId];
                    return newUploads;
                });
            }
        });
    }, [activeUploads]);

    // Check for and remove notifications for ready assets
    useEffect(() => {
        const uploadsToRemove: string[] = [];

        Object.entries(activeUploads).forEach(([uploadId, upload]) => {
            if (!upload.assetId) return;

            const matchingAsset = assets.find(asset => asset.id === upload.assetId);
            if (matchingAsset && 'mux_processing_status' in matchingAsset && matchingAsset.mux_processing_status === 'ready') {
                uploadsToRemove.push(uploadId);
            }
        });

        if (uploadsToRemove.length > 0) {
            setActiveUploads(prev => {
                const newUploads = { ...prev };
                uploadsToRemove.forEach(id => {
                    delete newUploads[id];
                });
                return newUploads;
            });
        }
    }, [assets, activeUploads]);

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
                    </div>
                </div>

                {showCamera && (
                    <CameraCaptureWrapper
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
                        const isProcessingVideo = asset.media_type === 'video' && asset.mux_processing_status === 'preparing';
                        const isItem = asset.media_type === 'item';
                        const isClickable = !isProcessingVideo;

                        // Get token specific to this asset's playbackId, if available
                        const token = asset.mux_playback_id ? thumbnailTokens[asset.mux_playback_id] : null;

                        // Determine the image source URL dynamically
                        let imageUrl = '';
                        let imageKey = asset.id; // Base key for React list

                        if (isItem && asset.mux_playback_id && asset.item_timestamp != null) {
                            // Generate signed URL for items using the helper and current token state
                            imageUrl = getMuxThumbnailUrl(asset.mux_playback_id, asset.item_timestamp, token);
                            imageKey = `${asset.id}-item-${token || 'no-token'}`; // Include token status in key
                        } else if (asset.media_type === 'video' && asset.mux_playback_id && asset.mux_processing_status === 'ready') {
                            // Generate signed URL for ready source videos (base thumbnail, time=0)
                            imageUrl = getMuxThumbnailUrl(asset.mux_playback_id, 0, token);
                            imageKey = `${asset.id}-video-${token || 'no-token'}`; // Include token status in key
                        } else if (asset.media_type === 'image') {
                            imageUrl = asset.media_url; // Direct URL for regular images
                            imageKey = `${asset.id}-image`;
                        }
                        // else: imageUrl remains '' for processing videos or errors

                        return (
                            <div
                                key={asset.id} // Keep base ID for outer div key
                                className={`group relative aspect-square rounded-lg overflow-hidden bg-muted ${isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed'} transition-opacity ${selectedAssets.has(asset.id) ? 'ring-2 ring-primary' : ''}`}
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

                                {isProcessingVideo ? (
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
                                ) : imageUrl ? ( // Render Image only if we determined a valid URL
                                    <Image
                                        key={imageKey} // Use more specific key for Image re-render on token change
                                        src={imageUrl}
                                        alt={asset.name}
                                        fill
                                        className="object-cover group-hover:scale-105 transition-transform"
                                        onError={(e) => {
                                            if (asset.mux_playback_id && !token) {
                                                console.warn(`Thumbnail failed for ${asset.id} (no token), attempting token refetch.`);
                                                fetchThumbnailToken(asset.mux_playback_id);
                                            } else {
                                                console.error(`Final error loading image for ${asset.id} URL: ${imageUrl}`, e);
                                                handleMediaError(asset.id, imageUrl, 'image', e);
                                            }
                                        }}
                                        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                        priority={false}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                        <p>{asset.media_type === 'video' ? 'Video Unavailable' : 'Image Unavailable'}</p>
                                    </div>
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

                                <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1.5 z-10">
                                    {isItem ? <ImageIcon size={14} /> : <VideoIcon size={14} />}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {selectedAsset && (
                    <AssetModal
                        asset={selectedAsset}
                        onClose={() => setSelectedAsset(null)}
                        onDelete={(deletedAssetId) => {
                            // Remove from local state immediately
                            setAssets(prev => prev.filter(a => a.id !== deletedAssetId));
                            setSelectedAsset(null);
                            // Also remove from multi-select if present
                            if (selectedAssets.has(deletedAssetId)) {
                                setSelectedAssets(prev => {
                                    const next = new Set(prev);
                                    next.delete(deletedAssetId);
                                    return next;
                                });
                            }
                            // onDelete prop is less critical now with realtime deletes
                        }}
                    />
                )}
            </div>
        </div>
    );
}