'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'
import { CameraCapture } from './camera-capture'
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
    const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({})
    const [videoPosterUrls, setVideoPosterUrls] = useState<Record<string, string | null>>({})
    const [thumbnailTokens, setThumbnailTokens] = useState<Record<string, string>>({})
    const [activeUploads, setActiveUploads] = useState<{
        [id: string]: {
            assetId: string;
            status: 'uploading' | 'processing' | 'complete' | 'error';
            message: string;
            startTime: number;
        }
    }>({})
    const supabase = createClient()

    // Define fetchThumbnailToken before the useEffect that uses it
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

    // Setup real-time subscription for assets table
    useEffect(() => {
        console.log('Setting up realtime subscription for user:', user.id);

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
                    // Handle postgres change notification
                    console.log('Received postgres update from Supabase:', payload.eventType,
                        'for asset:', (payload.new as { id?: string })?.id,
                        'status:', (payload.new as { mux_processing_status?: string })?.mux_processing_status);

                    // Handle different types of changes
                    if (payload.eventType === 'INSERT') {
                        setAssets(prevAssets => [payload.new as AssetWithMuxData, ...prevAssets]);
                    }
                    else if (payload.eventType === 'UPDATE') {
                        const updatedAsset = payload.new as AssetWithMuxData;
                        const oldAsset = payload.old as AssetWithMuxData;

                        // Log important changes for debugging
                        if (updatedAsset.mux_processing_status !== oldAsset.mux_processing_status) {
                            console.log(`Asset ${updatedAsset.id} status changed: ${oldAsset.mux_processing_status} -> ${updatedAsset.mux_processing_status}`);

                            // If status changed to ready, update active uploads
                            if (updatedAsset.mux_processing_status === 'ready') {
                                console.log('Asset is now ready - updating UI and aggressively clearing notifications:', updatedAsset.id);

                                // Immediately remove any upload notifications for this asset
                                setActiveUploads(prev => {
                                    // Log current upload notifications for debugging
                                    console.log('Current active uploads:', Object.entries(prev).map(([id, u]) => ({ id, assetId: u.assetId })));

                                    const newUploads = { ...prev };
                                    let found = false;

                                    // Find and remove any uploads for this asset
                                    Object.keys(newUploads).forEach(uploadId => {
                                        if (newUploads[uploadId].assetId === updatedAsset.id) {
                                            console.log(`Found and removing upload notification for ready asset: ${updatedAsset.id}`);
                                            delete newUploads[uploadId];
                                            found = true;
                                        }
                                    });

                                    if (!found) {
                                        console.log(`No upload notifications found for asset: ${updatedAsset.id}`);
                                    }

                                    return newUploads;
                                });

                                // If status changed to ready, fetch thumbnail token
                                if (updatedAsset.mux_playback_id && !thumbnailTokens[updatedAsset.mux_playback_id]) {
                                    console.log(`Fetching thumbnail token for newly ready asset: ${updatedAsset.id}`);
                                    fetchThumbnailToken(updatedAsset.mux_playback_id);
                                }
                            }
                        }

                        // Force a fresh copy of the asset to ensure all properties are updated
                        const freshAsset = {
                            ...updatedAsset
                        };

                        // Update the asset in the list forcefully
                        setAssets(prevAssets => {
                            // First check if the asset exists to avoid unnecessary re-renders
                            const assetExists = prevAssets.some(a => a.id === updatedAsset.id);
                            if (!assetExists) {
                                return prevAssets;
                            }

                            return prevAssets.map(asset =>
                                asset.id === updatedAsset.id
                                    ? freshAsset
                                    : asset
                            );
                        });

                        // If the selected asset was updated, update it too with the fresh copy
                        if (selectedAsset && selectedAsset.id === updatedAsset.id) {
                            setSelectedAsset(freshAsset);
                        }

                        // If status changed to ready, fetch thumbnail token
                        if (updatedAsset.mux_processing_status === 'ready' &&
                            updatedAsset.mux_playback_id &&
                            !thumbnailTokens[updatedAsset.mux_playback_id]) {
                            console.log(`Fetching thumbnail token for newly ready asset: ${updatedAsset.id}`);
                            fetchThumbnailToken(updatedAsset.mux_playback_id);
                        }

                        // Clear any media errors for this asset
                        if (mediaErrors[updatedAsset.id]) {
                            setMediaErrors(prev => {
                                const next = { ...prev };
                                delete next[updatedAsset.id];
                                return next;
                            });
                        }
                    }
                    else if (payload.eventType === 'DELETE') {
                        setAssets(prevAssets =>
                            prevAssets.filter(asset => asset.id !== payload.old.id)
                        );

                        // If the selected asset was deleted, close the modal
                        if (selectedAsset && selectedAsset.id === payload.old.id) {
                            setSelectedAsset(null);
                        }
                    }
                }
            )
            .on('broadcast', { event: 'asset-ready' }, (payload) => {
                // Handle broadcast message
                console.log('Received broadcast for asset-ready:', payload);

                if (payload.payload && typeof payload.payload === 'object' && 'id' in payload.payload) {
                    const assetId = payload.payload.id as string;

                    // Check if we have this asset
                    const assetExists = assets.some(a => a.id === assetId);
                    if (!assetExists) {
                        return;
                    }

                    // Fetch the latest asset data
                    supabase
                        .from('assets')
                        .select('*')
                        .eq('id', assetId)
                        .single()
                        .then(({ data, error }) => {
                            if (!error && data) {
                                const updatedAsset = data as AssetWithMuxData;
                                console.log('Asset data from broadcast:', updatedAsset);

                                // Update asset in list
                                setAssets(prevAssets =>
                                    prevAssets.map(a =>
                                        a.id === assetId ? updatedAsset : a
                                    )
                                );

                                // Update selected asset if needed
                                if (selectedAsset && selectedAsset.id === assetId) {
                                    setSelectedAsset(updatedAsset);
                                }

                                // Update upload notification if needed
                                if (updatedAsset.mux_processing_status === 'ready') {
                                    console.log('Asset from broadcast is now ready - aggressively clearing notifications:', assetId);

                                    // Immediately remove any upload notifications for this asset
                                    setActiveUploads(prev => {
                                        // Log current upload notifications for debugging
                                        console.log('Current active uploads from broadcast:', Object.entries(prev).map(([id, u]) => ({ id, assetId: u.assetId })));

                                        const newUploads = { ...prev };
                                        let found = false;

                                        // Find and remove any uploads for this asset
                                        Object.keys(newUploads).forEach(uploadId => {
                                            if (newUploads[uploadId].assetId === assetId) {
                                                console.log(`Found and removing upload notification for broadcast ready asset: ${assetId}`);
                                                delete newUploads[uploadId];
                                                found = true;
                                            }
                                        });

                                        if (!found) {
                                            console.log(`No upload notifications found for broadcast asset: ${assetId}`);
                                        }

                                        return newUploads;
                                    });
                                }
                            }
                        });
                }
            })
            .subscribe((status) => {
                console.log('Real-time subscription status:', status);
            });

        // Log the channel setup
        console.log('Realtime channel configured:', channel.topic);

        // Set up a periodic check for any preparing assets to handle cases where real-time updates fail
        const checkInterval = setInterval(() => {
            setAssets(prevAssets => {
                const preparingAssets = prevAssets.filter(
                    asset => asset.mux_processing_status === 'preparing' && asset.mux_asset_id
                );

                if (preparingAssets.length > 0) {
                    console.log('Found preparing assets, checking status:', preparingAssets.length);

                    // For each preparing asset, check if it should be refreshed
                    preparingAssets.forEach(asset => {
                        // Skip if we checked recently (within last 30 seconds)
                        const lastCheckedKey = `last_checked_${asset.id}`;
                        const lastChecked = parseInt(localStorage.getItem(lastCheckedKey) || '0', 10);
                        const now = Date.now();

                        if (now - lastChecked > 30000) { // 30 seconds 
                            // Mark this asset as checked
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
                                            console.log(`Manual refresh detected status change for asset ${asset.id}: ${asset.mux_processing_status} -> ${updatedAsset.mux_processing_status}`);

                                            // Update assets state
                                            setAssets(prevState =>
                                                prevState.map(a =>
                                                    a.id === asset.id ? updatedAsset : a
                                                )
                                            );

                                            // Update selected asset if needed
                                            if (selectedAsset && selectedAsset.id === asset.id) {
                                                setSelectedAsset(updatedAsset);
                                            }
                                        }
                                    }
                                });
                        }
                    });
                }

                // Don't change the assets here
                return prevAssets;
            });
        }, 15000); // Check every 15 seconds

        // Cleanup on unmount
        return () => {
            console.log('Cleaning up real-time subscription');
            channel.unsubscribe();
            clearInterval(checkInterval);
        };
    }, [user.id, selectedAsset, mediaErrors, thumbnailTokens, fetchThumbnailToken, supabase, activeUploads, assets]);

    async function handleCapture(file: File) {
        try {
            // If the file is a video, we upload it to Mux directly
            if (file.type.startsWith('video/')) {
                // Close the camera and show dashboard immediately
                setShowCamera(false);

                // Create a unique upload ID for tracking this upload
                const uploadId = `upload_${Date.now()}`;

                // Show the upload warning with clearer messaging
                setActiveUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        assetId: '',  // Will set this after response
                        status: 'uploading',
                        message: 'Uploading video to server... Please do not refresh until upload completes.',
                        startTime: Date.now()
                    }
                }));

                // Create a unique correlation ID to track this upload across page refreshes
                const correlationId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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

                console.log('Requesting Mux upload URL with metadata:', metadata, 'correlationId:', correlationId);

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

                // Try to get the error details from the response
                let errorData: Record<string, unknown> = {};
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

                const { uploadUrl, asset, clientReferenceId } = responseData;

                if (!uploadUrl) {
                    throw new Error('No upload URL returned from the server');
                }

                // After getting response, update the upload tracking
                if (asset) {
                    console.log('Adding asset to UI:', asset, 'clientReferenceId:', clientReferenceId);
                    // Store the reference ID in local storage to help with recovery if page refreshes
                    if (clientReferenceId) {
                        try {
                            localStorage.setItem('lastUploadReference', clientReferenceId);
                            localStorage.setItem('lastUploadTime', Date.now().toString());
                        } catch (e) {
                            console.warn('Could not store upload reference in localStorage:', e);
                        }
                    }
                    setAssets(prev => [asset, ...prev]);

                    // Update the active upload with the asset ID - be very clear for debugging
                    console.log(`Setting assetId ${asset.id} for upload ${uploadId} in notification`);
                    setActiveUploads(prev => {
                        // Check if this uploadId actually exists
                        if (!prev[uploadId]) {
                            console.warn(`Upload ${uploadId} not found in activeUploads!`);
                            return prev;
                        }

                        return {
                            ...prev,
                            [uploadId]: {
                                ...prev[uploadId],
                                assetId: asset.id,
                                status: 'processing',
                                message: 'Video uploaded. Processing is happening in the background - you can continue using the app.'
                            }
                        };
                    });
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
        // Check if there was a recent upload that might need recovery
        try {
            const lastUploadReference = localStorage.getItem('lastUploadReference');
            const lastUploadTime = localStorage.getItem('lastUploadTime');

            // Only attempt recovery for recent uploads (within the last hour)
            if (lastUploadReference && lastUploadTime) {
                const timeSinceUpload = Date.now() - Number(lastUploadTime);
                if (timeSinceUpload < 3600000) { // 1 hour
                    console.log('Found recent upload, checking if recovery is needed:', lastUploadReference);

                    // Check if this upload is already in our assets list
                    const existingAsset = assets.find(a =>
                        'client_reference_id' in a && a.client_reference_id === lastUploadReference
                    );

                    if (!existingAsset) {
                        console.log('Upload not found in current assets, querying database');
                        // The asset might exist in the database but not in our current state
                        supabase
                            .from('assets')
                            .select('*')
                            .eq('client_reference_id', lastUploadReference)
                            .eq('user_id', user.id)
                            .single()
                            .then(({ data, error }) => {
                                if (data && !error) {
                                    console.log('Found uploaded asset in database, adding to UI:', data);
                                    setAssets(prev => {
                                        // Check if it's already been added
                                        if (prev.some(a => a.id === data.id)) {
                                            return prev;
                                        }
                                        return [data as AssetWithMuxData, ...prev];
                                    });
                                } else if (error) {
                                    console.log('No existing upload found, clearing recovery data');
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
    }, [assets, supabase, user.id, thumbnailTokens, fetchThumbnailToken]);

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

    // Add function to handle media errors
    function handleMediaError(assetId: string, url: string, type: 'image' | 'video', error: unknown) {
        console.error(`Error loading ${type}:`, {
            assetId,
            url,
            error,
            timestamp: new Date().toISOString()
        })
        setMediaErrors(prev => ({ ...prev, [assetId]: 'Failed to load media' }))
    }

    // Add function to generate and cache video posters
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

    // Update the fetchThumbnailToken call when assets change
    useEffect(() => {
        // Find all assets with ready Mux videos that need tokens
        const muxAssets = assets.filter(
            asset => asset.mux_playback_id &&
                asset.mux_processing_status === 'ready' &&
                !thumbnailTokens[asset.mux_playback_id]
        );

        // Fetch tokens for each asset
        muxAssets.forEach(asset => {
            if (asset.mux_playback_id) {
                fetchThumbnailToken(asset.mux_playback_id);
            }
        });
    }, [assets, thumbnailTokens, fetchThumbnailToken]);

    // Ensure mux_playback_id is defined before using it
    const getThumbnailUrl = (asset: AssetWithMuxData) => {
        if (!asset.mux_playback_id) return '';

        return `https://image.mux.com/${asset.mux_playback_id}/thumbnail.jpg?width=640&fit_mode=preserve${thumbnailTokens[asset.mux_playback_id] ? `&token=${thumbnailTokens[asset.mux_playback_id]}` : ''
            }`;
    };

    // Update the UploadWarning component to be responsive and dark mode compatible
    function UploadWarning() {
        const activeUploadsList = Object.entries(activeUploads);

        if (activeUploadsList.length === 0) return null;

        return (
            <div className="fixed bottom-0 left-0 right-0 sm:bottom-4 sm:right-4 sm:left-auto z-50 flex flex-col gap-2 p-2 sm:p-0 max-w-full sm:max-w-md">
                {activeUploadsList.map(([uploadId, upload]) => (
                    <div
                        key={uploadId}
                        className={`
                            rounded-lg p-3 sm:p-4 shadow-lg w-full 
                            ${upload.status === 'error'
                                ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100'
                                : upload.status === 'complete'
                                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100'
                                    : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100'
                            }
                        `}
                    >
                        <div className="flex items-center gap-3">
                            {upload.status === 'error' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ) : upload.status === 'complete' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                <div className="animate-spin h-5 w-5 flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </div>
                            )}
                            <div className="flex-grow">
                                <p className="font-medium text-sm sm:text-base break-words">{upload.message}</p>
                                {upload.status === 'processing' && (
                                    <p className="text-sm mt-1 opacity-80">Don&apos;t worry, we&apos;ll notify you when it&apos;s ready.</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // Also add a timeout to auto-dismiss processing notifications after 3 minutes
    // This is a fallback in case webhook processing fails
    useEffect(() => {
        // Set up a timer to automatically dismiss processing notifications after 3 minutes
        const processingUploads = Object.entries(activeUploads).filter(
            ([, upload]) => upload.status === 'processing'
        );

        processingUploads.forEach(([uploadId, upload]) => {
            const elapsed = Date.now() - upload.startTime;
            const maxProcessingTime = 3 * 60 * 1000; // 3 minutes

            if (elapsed > maxProcessingTime) {
                console.log(`Auto-dismissing stale processing notification for ${upload.assetId}`);
                setActiveUploads(prev => {
                    const newUploads = { ...prev };
                    delete newUploads[uploadId];
                    return newUploads;
                });
            }
        });

        return () => { };
    }, [activeUploads]);

    // Add a direct effect to check for and remove notifications for ready assets
    useEffect(() => {
        // This effect specifically monitors assets for status changes
        console.log('Checking assets for completed uploads...');

        // Find all uploads that have corresponding assets that are now ready
        const uploadsToRemove: string[] = [];

        // For each active upload notification, check if its asset is now ready
        Object.entries(activeUploads).forEach(([uploadId, upload]) => {
            // Skip if no assetId assigned yet
            if (!upload.assetId) return;

            // Find this asset in the assets list
            const matchingAsset = assets.find(asset => asset.id === upload.assetId);
            if (matchingAsset && 'mux_processing_status' in matchingAsset && matchingAsset.mux_processing_status === 'ready') {
                console.log(`Found ready asset for active upload - removing notification: ${upload.assetId}`);
                uploadsToRemove.push(uploadId);
            }
        });

        // Remove the identified uploads
        if (uploadsToRemove.length > 0) {
            console.log(`Removing ${uploadsToRemove.length} completed upload notifications`);
            setActiveUploads(prev => {
                const newUploads = { ...prev };
                uploadsToRemove.forEach(id => {
                    delete newUploads[id];
                });
                return newUploads;
            });
        }
    }, [assets, activeUploads]);

    // Add a debug effect to log notification state
    useEffect(() => {
        // Log notification state when it changes
        if (Object.keys(activeUploads).length > 0) {
            console.log('Active uploads state changed:',
                Object.entries(activeUploads).map(([id, upload]) => ({
                    id,
                    assetId: upload.assetId,
                    status: upload.status,
                    elapsedSeconds: Math.floor((Date.now() - upload.startTime) / 1000)
                }))
            );
        }
    }, [activeUploads]);

    // Also add a special function to clear notifications if we get into a stuck state
    // This is just for debugging - we shouldn't need it in production
    const DEBUG_clearAllNotifications = () => {
        // You can call this from browser console with:
        // document.dispatchEvent(new CustomEvent('debug-clear-notifications'));
        setActiveUploads({});
        console.log('All notifications cleared by debug function');
    };

    useEffect(() => {
        // Listen for a debug clear event
        const handleDebugClear = () => DEBUG_clearAllNotifications();
        document.addEventListener('debug-clear-notifications', handleDebugClear);

        return () => {
            document.removeEventListener('debug-clear-notifications', handleDebugClear);
        };
    }, []);

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
                                className={`group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity ${selectedAssets.has(asset.id) ? 'ring-2 ring-primary' : ''}`}
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
                                        {/* For Mux videos - display a thumbnail from Mux */}
                                        {asset.mux_playback_id ? (
                                            <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
                                                {/* Use Mux thumbnail if available */}
                                                {asset.mux_processing_status === 'ready' ? (
                                                    <>
                                                        <Image
                                                            src={getThumbnailUrl(asset)}
                                                            alt={asset.name || 'Video thumbnail'}
                                                            fill
                                                            className="object-cover hover:scale-105 transition-transform"
                                                            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                                            onError={() => {
                                                                // If thumbnail still fails, fetch a token and retry once
                                                                if (asset.mux_playback_id && !thumbnailTokens[asset.mux_playback_id]) {
                                                                    fetchThumbnailToken(asset.mux_playback_id);
                                                                } else {
                                                                    setMediaErrors(prev => ({
                                                                        ...prev,
                                                                        [asset.id]: 'Failed to load thumbnail'
                                                                    }));
                                                                }
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <div className="w-12 h-12 bg-primary/80 rounded-full flex items-center justify-center">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polygon points="5 3 19 12 5 21 5 3" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Fallback for processing videos */}
                                                        <div className="text-white text-center">
                                                            <div className="animate-spin h-8 w-8 mx-auto mb-2">
                                                                <SpinnerIcon />
                                                            </div>
                                                            <span>Processing</span>
                                                        </div>
                                                    </>
                                                )}

                                                {/* Video icon indicator */}
                                                <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1.5 z-10">
                                                    <VideoIcon size={14} />
                                                </div>

                                                {/* Processing status indicator */}
                                                {asset.mux_processing_status !== 'ready' && (
                                                    <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-1 z-10">
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
                                                    handleMediaError(
                                                        asset.id,
                                                        asset.media_url,
                                                        'video',
                                                        e
                                                    );
                                                }}
                                                preload="metadata"
                                                muted
                                                playsInline
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center">
                                                    <p className="text-muted-foreground">Video</p>
                                                </div>
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
                                                    null
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

            {/* Add the upload warning popup */}
            <UploadWarning />
        </div>
    );
} 