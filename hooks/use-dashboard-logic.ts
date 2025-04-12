'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { uploadToS3 } from '@/utils/s3';
import { AssetWithMuxData } from '@/types/mux';
import { User } from '@supabase/supabase-js';

// Re-declare the ActiveUpload type here or import if moved to a shared types file
type ActiveUpload = {
    assetId: string;
    status: 'uploading' | 'processing' | 'transcribing' | 'complete' | 'error';
    message: string;
    startTime: number;
}

type UseDashboardLogicProps = {
    initialAssets: AssetWithMuxData[];
    user: User;
}

export function useDashboardLogic({ initialAssets, user }: UseDashboardLogicProps) {
    const [showCamera, setShowCamera] = useState(false);
    const [capturedFile, setCapturedFile] = useState<File | null>(null);
    const [assets, setAssets] = useState<AssetWithMuxData[]>(initialAssets);
    const [selectedAsset, setSelectedAsset] = useState<AssetWithMuxData | null>(null);
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
    const [thumbnailTokens, setThumbnailTokens] = useState<Record<string, string>>({});
    const [activeUploads, setActiveUploads] = useState<Record<string, ActiveUpload>>({});

    const supabase = createClient();

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
                    console.log('[REALTIME HANDLER] Received payload:', payload);
                    if (payload.eventType === 'INSERT') {
                        const newAsset = payload.new as AssetWithMuxData;
                        console.log(`[REALTIME HANDLER] INSERT detected: ${newAsset.id}, type: ${newAsset.media_type}, status: ${newAsset.mux_processing_status}`);

                        // Check if the asset already exists to prevent duplicates from rapid events
                        if (assets.some(asset => asset.id === newAsset.id)) {
                            console.warn(`[REALTIME HANDLER] Duplicate INSERT event ignored for asset ${newAsset.id}`);
                            return;
                        }

                        // Construct full media URL for S3 images if necessary
                        let assetToAdd = newAsset;
                        if (assetToAdd.media_type === 'image' && assetToAdd.media_url && !assetToAdd.media_url.startsWith('http')) {
                            assetToAdd = {
                                ...assetToAdd,
                                media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${assetToAdd.media_url}`
                            };
                            console.log(`[REALTIME HANDLER] Transformed INSERT image media_url for ${assetToAdd.id} to: ${assetToAdd.media_url}`);
                        }

                        setAssets(prevAssets => {
                            // Add the new asset and re-sort
                            const updatedAssets = [assetToAdd, ...prevAssets]
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                            console.log(`[REALTIME HANDLER] State updated after INSERT. New count: ${updatedAssets.length}`);
                            return updatedAssets;
                        });

                        // Clear potential errors for this asset if it was previously errored
                        if (mediaErrors[newAsset.id]) {
                            setMediaErrors(prev => {
                                const next = { ...prev };
                                delete next[newAsset.id];
                                return next;
                            });
                        }
                    }
                    else if (payload.eventType === 'UPDATE') {
                        const updatedAsset = payload.new as AssetWithMuxData;
                        const oldAsset = payload.old as AssetWithMuxData;
                        const changes = Object.keys(updatedAsset)
                            .filter(key => updatedAsset[key as keyof AssetWithMuxData] !== oldAsset[key as keyof AssetWithMuxData])
                            .map(key => `${key}: ${oldAsset[key as keyof AssetWithMuxData]} → ${updatedAsset[key as keyof AssetWithMuxData]}`)
                            .join(', ');
                        console.log(`[REALTIME HANDLER] UPDATE detected for asset ${updatedAsset.id}: ${changes}`);

                        // Update Mux processing status display
                        if ('mux_processing_status' in updatedAsset && 'mux_processing_status' in oldAsset &&
                            updatedAsset.mux_processing_status !== oldAsset.mux_processing_status) {
                            if (updatedAsset.mux_processing_status === 'ready') {
                                setActiveUploads(prev => {
                                    const newUploads = { ...prev };
                                    Object.keys(newUploads).forEach(uploadId => {
                                        if (newUploads[uploadId].assetId === updatedAsset.id) {
                                            // Check transcript status *before* deciding to remove or update notification
                                            if (updatedAsset.transcript_processing_status === 'pending' || updatedAsset.transcript_processing_status === 'processing') {
                                                newUploads[uploadId].status = 'transcribing';
                                                newUploads[uploadId].message = 'Video ready. Generating transcript...';
                                            } else {
                                                // Transcript already done or not applicable, remove notification
                                                delete newUploads[uploadId];
                                            }
                                        }
                                    });
                                    return newUploads;
                                });
                                // Fetch thumbnail if ready and token not already present
                                if (updatedAsset.mux_playback_id && !thumbnailTokens[updatedAsset.mux_playback_id]) {
                                    fetchThumbnailToken(updatedAsset.mux_playback_id);
                                }
                            }
                        }

                        // Update transcript processing status display
                        if ('transcript_processing_status' in updatedAsset && 'transcript_processing_status' in oldAsset &&
                            updatedAsset.transcript_processing_status !== oldAsset.transcript_processing_status) {
                            console.log(`[REALTIME UPDATE] Transcript status changed for asset ${updatedAsset.id}: `, `${oldAsset.transcript_processing_status} → ${updatedAsset.transcript_processing_status}`);
                            // Remove notification if transcript completes/errors *while* it was in 'transcribing' state
                            if (updatedAsset.transcript_processing_status === 'completed' || updatedAsset.transcript_processing_status === 'error') {
                                setActiveUploads(prev => {
                                    const newUploads = { ...prev };
                                    Object.keys(newUploads).forEach(uploadId => {
                                        if (newUploads[uploadId].assetId === updatedAsset.id && newUploads[uploadId].status === 'transcribing') {
                                            delete newUploads[uploadId];
                                        }
                                    });
                                    return newUploads;
                                });
                            }
                        }

                        setAssets(prevAssets => {
                            // Ensure uniqueness: Map existing assets by ID
                            const assetMap = new Map(prevAssets.map(asset => [asset.id, asset]));
                            // Set the updated asset in the map (replaces if exists)
                            assetMap.set(updatedAsset.id, updatedAsset);
                            // Convert map back to array, maintaining a reasonable order (e.g., new/updated first)
                            const updatedArray = Array.from(assetMap.values())
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Sort by creation date descending
                            console.log(`[REALTIME HANDLER] State updated after UPDATE for ${updatedAsset.id}. New count: ${updatedArray.length}`);
                            return updatedArray;
                        });

                        // Update modal if the asset being viewed is the one updated
                        if (selectedAsset && selectedAsset.id === updatedAsset.id) {
                            console.log('[REALTIME UPDATE] Also updating currently selected asset in modal');
                            setSelectedAsset(updatedAsset); // Update modal state
                        }

                        // Clear media errors if the asset updates successfully
                        if (mediaErrors[updatedAsset.id]) {
                            setMediaErrors(prev => {
                                const next = { ...prev };
                                delete next[updatedAsset.id];
                                return next;
                            });
                        }
                    }
                    else if (payload.eventType === 'DELETE') {
                        const deletedAssetId = payload.old.id;
                        console.log(`[REALTIME HANDLER] DELETE detected: ${deletedAssetId}`);
                        setAssets(prevAssets => {
                            const updated = prevAssets.filter(asset => asset.id !== deletedAssetId);
                            console.log(`[REALTIME HANDLER] State updated after DELETE. New count: ${updated.length}`);
                            return updated;
                        });
                        if (selectedAsset && selectedAsset.id === deletedAssetId) {
                            setSelectedAsset(null);
                        }
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
            .subscribe((status, err) => {
                // Log status changes and errors
                console.log(`[REALTIME SUBSCRIBE] Assets subscription status: ${status}`);
                if (err) {
                    console.error('[REALTIME SUBSCRIBE] Subscription error:', err);
                }
                if (status === 'SUBSCRIBED') {
                    console.log('[REALTIME SUBSCRIBE] Successfully subscribed to asset changes!');
                }
            });

        return () => {
            console.log('[REALTIME CLEANUP] Unsubscribing from asset changes.');
            channel.unsubscribe();
        };
    }, [user.id, supabase, fetchThumbnailToken, selectedAsset, mediaErrors]);

    // Handle captured media files
    const handleCapture = useCallback(async (file: File) => {
        try {
            if (file.type.startsWith('video/')) {
                setShowCamera(false);
                const uploadId = `upload_${Date.now()}`;
                setActiveUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        assetId: '', status: 'uploading',
                        message: 'Uploading video to server... Please do not refresh until upload completes.',
                        startTime: Date.now()
                    }
                }));
                const correlationId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const metadata = {
                    name: `Video - ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}`,
                    description: null, estimated_value: null
                };
                const response = await fetch('/api/mux/upload', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ metadata, correlationId }),
                });
                if (!response.ok) throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
                const { uploadUrl, asset, clientReferenceId } = await response.json();
                if (!uploadUrl) throw new Error('No upload URL returned from the server');
                if (asset) {
                    if (clientReferenceId) {
                        try {
                            localStorage.setItem('lastUploadReference', clientReferenceId);
                            localStorage.setItem('lastUploadTime', Date.now().toString());
                        } catch (e) { console.warn('Could not store upload reference in localStorage:', e); }
                    }
                    setAssets(prev => [asset, ...prev]);
                    setActiveUploads(prev => ({
                        ...prev,
                        [uploadId]: { ...prev[uploadId], assetId: asset.id, status: 'processing', message: 'Video uploaded. Processing is happening in the background...' }
                    }));
                }
                const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                if (!uploadResponse.ok) throw new Error(`Failed to upload to Mux: ${uploadResponse.status} ${uploadResponse.statusText}`);
            } else {
                setCapturedFile(file);
                setShowCamera(false);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const uploadIds = Object.keys(activeUploads);
            if (uploadIds.length > 0) {
                const latestUploadId = uploadIds[uploadIds.length - 1];
                setActiveUploads(prev => ({ ...prev, [latestUploadId]: { ...prev[latestUploadId], status: 'error', message: `Error: ${errorMessage}` } }));
                setTimeout(() => {
                    setActiveUploads(prev => { const newUploads = { ...prev }; delete newUploads[latestUploadId]; return newUploads; });
                }, 5000);
            }
            console.error('Error handling capture:', error);
            alert(error instanceof Error ? error.message : 'Failed to process capture. Please try again.');
            setShowCamera(false);
        }
    }, [activeUploads, setActiveUploads, setAssets, setCapturedFile, setShowCamera]);

    // Add a recovery mechanism for uploads after page refresh
    useEffect(() => {
        try {
            const lastUploadReference = localStorage.getItem('lastUploadReference');
            const lastUploadTime = localStorage.getItem('lastUploadTime');
            if (lastUploadReference && lastUploadTime) {
                const timeSinceUpload = Date.now() - Number(lastUploadTime);
                if (timeSinceUpload < 3600000) {
                    const existingAsset = assets.find(a => 'client_reference_id' in a && a.client_reference_id === lastUploadReference);
                    if (!existingAsset) {
                        supabase.from('assets').select('*').eq('client_reference_id', lastUploadReference).eq('user_id', user.id).single()
                            .then(({ data, error }) => {
                                if (data && !error) {
                                    setAssets(prev => {
                                        if (prev.some(a => a.id === data.id)) return prev;
                                        return [data as AssetWithMuxData, ...prev];
                                    });
                                } else if (error) {
                                    localStorage.removeItem('lastUploadReference');
                                    localStorage.removeItem('lastUploadTime');
                                }
                            });
                    }
                } else {
                    localStorage.removeItem('lastUploadReference');
                    localStorage.removeItem('lastUploadTime');
                }
            }
        } catch (e) { console.warn('Error checking for upload recovery:', e); }
    }, [assets, supabase, user.id]);

    // Handle saving images uploaded via the camera
    const handleSave = useCallback(async (url: string, metadata: { name: string; description: string | null; estimated_value: number | null }) => {
        try {
            if (!capturedFile) { console.error('No file captured'); return; }
            const response = await uploadToS3(capturedFile, metadata);
            const { key } = response;
            const { data: asset, error } = await supabase
                .from('assets').insert([{ user_id: user.id, name: metadata.name, description: metadata.description, estimated_value: metadata.estimated_value, media_url: key, media_type: capturedFile.type.startsWith('video/') ? 'video' : 'image' }]).select().single();
            if (error) throw error;
            const transformedAsset = { ...asset, media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}` } as AssetWithMuxData;
            setAssets(prev => [transformedAsset, ...prev]);
            setCapturedFile(null);
        } catch (error: unknown) {
            const err = error as Error & { details?: string; hint?: string; code?: string; name?: string };
            console.error('Error saving asset:', { message: err?.message, details: err?.details, stack: err?.stack, name: err?.name });
            alert('Failed to save asset. Please try again.');
        }
    }, [capturedFile, setAssets, setCapturedFile, supabase, user.id]);

    // Handle asset selection for multi-select mode
    const toggleAssetSelection = useCallback((assetId: string, event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
        event.stopPropagation();
        const newSelectedAssets = new Set(selectedAssets);
        if (newSelectedAssets.has(assetId)) {
            newSelectedAssets.delete(assetId);
        } else {
            newSelectedAssets.add(assetId);
        }
        setSelectedAssets(newSelectedAssets);
    }, [selectedAssets]);

    // Handle bulk delete of selected assets
    const handleBulkDelete = useCallback(async () => {
        if (!window.confirm(`Are you sure you want to delete ${selectedAssets.size} assets? This action cannot be undone.`)) return;
        setIsDeleting(true);
        const assetsToDeleteIds = Array.from(selectedAssets);
        const assetsToDelete = assets.filter(asset => assetsToDeleteIds.includes(asset.id));
        let errors: { id: string, error: string }[] = [];
        console.log(`Attempting to bulk delete ${assetsToDelete.length} assets:`, assetsToDeleteIds);
        for (const asset of assetsToDelete) {
            try {
                console.log(`Processing deletion for asset ${asset.id}, type: ${asset.media_type}`);
                if (asset.media_type === 'item') {
                    console.log(`Deleting item asset (DB only): ${asset.id}`);
                    const { error: dbError } = await supabase.from('assets').delete().eq('id', asset.id);
                    if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                } else if (asset.media_type === 'video' && asset.mux_asset_id) {
                    console.log(`Deleting source Mux asset via API: ${asset.id}`);
                    try {
                        const response = await fetch('/api/mux/delete', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ assetId: asset.id }),
                        });
                        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Mux API delete failed (${response.status})`); }
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error(`Error deleting asset ${asset.id}:`, errorMessage);
                        errors.push({ id: asset.id, error: errorMessage });
                    }
                } else if (asset.media_type === 'image' && asset.media_url && !asset.mux_asset_id) {
                    console.log(`Deleting S3 image asset (DB & S3): ${asset.id}`);
                    const { error: dbError } = await supabase.from('assets').delete().eq('id', asset.id);
                    if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                    const key = asset.media_url.split('/').pop();
                    if (key) {
                        const response = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
                        if (!response.ok) console.error(`Failed to delete S3 object for key ${key}, but DB record deleted.`);
                    } else console.warn(`Could not determine S3 key for asset ${asset.id}`);
                } else {
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
        const successfulDeletes = assetsToDeleteIds.filter(id => !errors.some(e => e.id === id));
        if (successfulDeletes.length > 0) {
            setAssets(prev => prev.filter(asset => !successfulDeletes.includes(asset.id)));
        }
        setSelectedAssets(new Set());
        setIsSelectionMode(false);
        setIsDeleting(false);
        if (errors.length > 0) {
            alert(`Failed to delete ${errors.length} asset(s). Please check the console for details.`);
        }
    }, [assets, selectedAssets, supabase, setAssets, setSelectedAssets, setIsSelectionMode, setIsDeleting]);

    // Handle clicking on an asset
    const handleAssetClick = useCallback((asset: AssetWithMuxData, event: React.MouseEvent) => {
        if (asset.media_type === 'video' && asset.mux_processing_status === 'preparing') return;
        if (isSelectionMode) {
            toggleAssetSelection(asset.id, event);
        } else {
            setSelectedAsset(asset);
        }
    }, [isSelectionMode, toggleAssetSelection, setSelectedAsset]);

    // Handle media errors
    const handleMediaError = useCallback((assetId: string, url: string, error: unknown) => {
        console.error(`Error loading media:`, { assetId, url, error });
        setMediaErrors(prev => ({ ...prev, [assetId]: 'Failed to load media' }));
    }, []);

    // Handler to retry media loading
    const handleRetryMedia = useCallback((assetId: string) => {
        setMediaErrors(prev => {
            const next = { ...prev };
            delete next[assetId];
            return next;
        });
        // Optional: Force re-fetch thumbnail token if relevant
        const asset = assets.find(a => a.id === assetId);
        if (asset?.mux_playback_id) {
            fetchThumbnailToken(asset.mux_playback_id);
        }
    }, [assets, fetchThumbnailToken]);

    // Fetch thumbnail tokens for ready Mux videos initially and when assets change
    useEffect(() => {
        const muxAssetsNeedingTokens = assets.filter(
            asset => asset.mux_playback_id &&
                asset.mux_processing_status === 'ready' &&
                !thumbnailTokens[asset.mux_playback_id]
        );
        muxAssetsNeedingTokens.forEach(asset => {
            if (asset.mux_playback_id) {
                fetchThumbnailToken(asset.mux_playback_id);
            }
        });
    }, [assets, thumbnailTokens, fetchThumbnailToken]);

    // Auto-dismiss processing notifications after 3 minutes
    useEffect(() => {
        const processingUploads = Object.entries(activeUploads).filter(([, upload]) => upload.status === 'processing');
        processingUploads.forEach(([uploadId, upload]) => {
            const elapsed = Date.now() - upload.startTime;
            const maxProcessingTime = 3 * 60 * 1000;
            if (elapsed > maxProcessingTime) {
                setActiveUploads(prev => {
                    const newUploads = { ...prev };
                    delete newUploads[uploadId];
                    return newUploads;
                });
            }
        });
    }, [activeUploads]);

    // Check for and remove notifications for assets that become ready (Mux or transcript)
    useEffect(() => {
        const uploadsToRemove: string[] = [];
        Object.entries(activeUploads).forEach(([uploadId, upload]) => {
            if (!upload.assetId) return;
            const matchingAsset = assets.find(asset => asset.id === upload.assetId);
            if (matchingAsset) {
                const isMuxReady = 'mux_processing_status' in matchingAsset && matchingAsset.mux_processing_status === 'ready';
                const isTranscriptDone = 'transcript_processing_status' in matchingAsset && (matchingAsset.transcript_processing_status === 'completed' || matchingAsset.transcript_processing_status === 'error');

                // Remove if Mux is ready AND (transcript is done OR transcript wasn't processing)
                if (isMuxReady && (isTranscriptDone || upload.status !== 'transcribing')) {
                    uploadsToRemove.push(uploadId);
                }
            }
        });

        if (uploadsToRemove.length > 0) {
            setActiveUploads(prev => {
                const newUploads = { ...prev };
                uploadsToRemove.forEach(id => { delete newUploads[id]; });
                return newUploads;
            });
        }
    }, [assets, activeUploads]);

    // Handler to toggle selection mode
    const handleToggleSelectionMode = useCallback(() => {
        setIsSelectionMode(prev => !prev);
        setSelectedAssets(new Set()); // Clear selection when toggling mode
    }, []);

    // Handler to open camera
    const handleAddNewAsset = useCallback(() => {
        setShowCamera(true);
    }, []);

    // Handler to close camera
    const handleCloseCamera = useCallback(() => {
        setShowCamera(false);
    }, []);

    // Handler to close media preview
    const handleCancelMediaPreview = useCallback(() => {
        setCapturedFile(null);
    }, []);

    // Handler to retry from media preview
    const handleRetryMediaPreview = useCallback(() => {
        setCapturedFile(null);
        setShowCamera(true);
    }, []);

    // Handler to close asset modal
    const handleCloseAssetModal = useCallback(() => {
        setSelectedAsset(null);
    }, []);

    // Handler for when asset is deleted from the modal
    // (Realtime updates handle the state change, but we need to close the modal)
    const handleAssetDeletedFromModal = useCallback((deletedAssetId: string) => {
        setSelectedAsset(null); // Close modal if the deleted asset was selected
        // No need to modify `assets` state here due to realtime updates
        // No need to modify `selectedAssets` here, handled by realtime delete event
    }, []);


    return {
        // State
        showCamera,
        capturedFile,
        assets,
        selectedAsset,
        selectedAssets,
        isSelectionMode,
        isDeleting,
        mediaErrors,
        thumbnailTokens,
        activeUploads,

        // Handlers
        handleCapture,
        handleSave,
        handleBulkDelete,
        handleAssetClick,
        handleMediaError,
        handleRetryMedia,
        toggleAssetSelection,
        fetchThumbnailToken, // Expose if needed by AssetGrid/Card directly
        handleToggleSelectionMode,
        handleAddNewAsset,
        handleCloseCamera,
        handleCancelMediaPreview,
        handleRetryMediaPreview,
        handleCloseAssetModal,
        handleAssetDeletedFromModal,

        // Setters (usually not needed, but maybe for specific cases like closing modal)
        // setSelectedAsset, // Example
    };
} 