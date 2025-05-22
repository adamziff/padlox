'use client'

import { AssetWithMuxData } from '@/types/mux'
import Image from 'next/image'
import { Button } from './ui/button'
import { formatCurrency } from '@/utils/format'
import { CrossIcon, TrashIcon, DownloadIcon } from './icons'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { MuxPlayer } from './mux-player'
import { getMuxThumbnailUrl } from '@/lib/mux'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from '@/components/ui/label';
import { useDebouncedCallback } from 'use-debounce';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Assuming shadcn/ui
import { Badge } from "@/components/ui/badge"; // Assuming shadcn/ui

// Define Tag and Room types if not imported from a central location
interface Tag {
    id: string;
    name: string;
}

interface Room {
    id: string;
    name: string;
}
interface AssetModalProps {
    asset: AssetWithMuxData;
    onClose: () => void;
    onDelete?: (id: string) => void;
    availableTags: Tag[];
    availableRooms: Room[];
    onAssetUpdate: (updatedAsset: AssetWithMuxData) => void;
}

export function AssetModal({
    asset: initialAsset,
    onClose,
    onDelete,
    availableTags,
    availableRooms,
    onAssetUpdate
}: AssetModalProps) {
    const [asset, setAsset] = useState<AssetWithMuxData>(initialAsset);
    const [isDeleting, setIsDeleting] = useState(false);
    const supabase = createClient();
    const [modalToken, setModalToken] = useState<string | null>(null);
    const [isLoadingToken, setIsLoadingToken] = useState(false);

    // Add state for editable fields
    const [editableName, setEditableName] = useState(asset.name || '');
    const [editableDescription, setEditableDescription] = useState(asset.description || '');
    const [editableValue, setEditableValue] = useState<string>(asset.estimated_value != null ? String(asset.estimated_value) : '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // State for managing current room and tags in the modal
    const [currentRoomId, setCurrentRoomId] = useState<string>(initialAsset.room?.id || "");
    const [currentTagIds, setCurrentTagIds] = useState<string[]>(initialAsset.tags?.map(t => t.id) || []);
    
    // State for UI feedback during room/tag updates
    const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
    const [roomUpdateError, setRoomUpdateError] = useState<string | null>(null);
    const [isUpdatingTags, setIsUpdatingTags] = useState(false);
    const [tagsUpdateError, setTagsUpdateError] = useState<string | null>(null);
    const [tagsToAdd, setTagsToAdd] = useState<string[]>([]); // For the multi-select to add tags

    // Define these based on the current asset state
    const isItem = asset.media_type === 'item';
    const isVideo = asset.media_type === 'video';
    const hasMuxData = 'mux_playback_id' in asset && !!asset.mux_playback_id;
    const isMuxProcessing = isVideo && asset.mux_processing_status === 'preparing';
    const isMuxReady = isVideo && asset.mux_processing_status === 'ready';

    // Fetch the signed token when the asset changes or modal opens
    useEffect(() => {
        let isMounted = true;
        const fetchToken = async () => {
            if (asset?.mux_playback_id) {
                setIsLoadingToken(true);
                setModalToken(null); // Clear previous token
                try {
                    // Determine the timestamp to use (if any)
                    const timestamp = isItem && asset.item_timestamp != null ? asset.item_timestamp : undefined;

                    // Construct the URL, adding the timestamp only if provided
                    let apiUrl = `/api/mux/token?playbackId=${asset.mux_playback_id}&_=${Date.now()}`;
                    if (timestamp !== undefined) {
                        apiUrl += `&time=${timestamp}`;
                    }

                    // Fetch token from the API endpoint
                    const response = await fetch(apiUrl);
                    if (!response.ok) {
                        let errorMessage = `${response.status} ${response.statusText}`;
                        try {
                            const errorData = await response.json();
                            errorMessage += `: ${errorData.message || 'Unknown error'}`;
                        } catch {
                            // Ignore error during error message generation
                        }
                        throw new Error(`Failed to fetch token: ${errorMessage}`);
                    }
                    const data = await response.json();

                    // The API returns tokens for different purposes
                    const token = data.tokens?.thumbnail;

                    if (isMounted && token) {
                        setModalToken(token);
                    } else if (isMounted) {
                        console.warn("Thumbnail token not found in API response for", asset.mux_playback_id);
                    }
                } catch (error) {
                    console.error("Failed to fetch thumbnail token:", error);
                    if (isMounted) {
                        // Handle token fetch error appropriately (e.g., show message)
                    }
                } finally {
                    if (isMounted) {
                        setIsLoadingToken(false);
                    }
                }
            }
        };

        fetchToken();

        return () => {
            isMounted = false;
        };
    }, [asset, isItem]); // Re-fetch if the asset changes OR if it changes type (edge case)

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
                    // Extract the old and new asset data
                    const oldAsset = payload.old as Partial<AssetWithMuxData>;
                    const newAsset = payload.new as AssetWithMuxData;

                    console.log('Asset modal received postgres update:',
                        'for asset:', asset.id,
                        'new status:', newAsset.mux_processing_status,
                        'old status:', oldAsset.mux_processing_status);

                    // Add detailed logging for transcript changes
                    if ('transcript_processing_status' in newAsset && 'transcript_processing_status' in oldAsset) {
                        if (newAsset.transcript_processing_status !== oldAsset.transcript_processing_status) {
                            console.log(`[ASSET MODAL] Transcript status changed: ${oldAsset.transcript_processing_status} → ${newAsset.transcript_processing_status}`);
                        }
                    }

                    // Check if transcript text was added
                    if ((!oldAsset.transcript_text || oldAsset.transcript_text === '') &&
                        newAsset.transcript_text &&
                        newAsset.transcript_text !== '') {
                        console.log(`[ASSET MODAL] Transcript text received (${newAsset.transcript_text.length} chars)`);
                    }

                    // Create a fresh copy to ensure all properties are updated
                    const updatedAsset = { ...newAsset } as AssetWithMuxData;

                    // Update our local state with the changes
                    console.log(`[ASSET MODAL] Updating asset state with new data`);
                    setAsset(updatedAsset);
                }
            )
            .on('broadcast', { event: 'asset-ready' }, (payload) => {
                console.log('[ASSET MODAL] Received asset-ready broadcast for asset:', payload);

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
                                console.log('[ASSET MODAL] Updated asset data from broadcast:', data);
                                setAsset(data as AssetWithMuxData);
                            }
                        });
                }
            })
            .on('broadcast', { event: 'transcript-ready' }, (payload) => {
                console.log('[ASSET MODAL] Received transcript-ready broadcast:', payload);

                // Check if the broadcast is for this asset
                if (payload.payload && payload.payload.id === asset.id) {
                    console.log('[ASSET MODAL] Transcript is ready for this asset, fetching updated data');

                    // Fetch the latest asset data including the transcript
                    supabase
                        .from('assets')
                        .select('*')
                        .eq('id', asset.id)
                        .single()
                        .then(({ data, error }) => {
                            if (!error && data) {
                                const updatedAsset = data as AssetWithMuxData;
                                console.log('[ASSET MODAL] Updated asset with transcript:',
                                    `Status: ${updatedAsset.transcript_processing_status}`,
                                    `Has transcript: ${!!updatedAsset.transcript}`,
                                    `Text length: ${updatedAsset.transcript_text?.length || 0} chars`);

                                setAsset(updatedAsset);
                            } else {
                                console.error('[ASSET MODAL] Error fetching updated asset with transcript:', error);
                            }
                        });
                }
            })
            .subscribe((status) => {
                console.log(`Asset subscription status for ${asset.id}:`, status);
            });

        // Set up a periodic check for transcript updates as a fallback
        let refreshTimer: NodeJS.Timeout | null = null;

        // Only set up the timer for assets that are waiting for transcription
        if ('transcript_processing_status' in asset &&
            (asset.transcript_processing_status === 'pending' ||
                asset.transcript_processing_status === 'processing')) {

            console.log(`[ASSET MODAL] Setting up transcript check timer for asset: ${asset.id}`);

            refreshTimer = setInterval(() => {
                console.log(`[ASSET MODAL] Checking transcript status for asset: ${asset.id}`);

                supabase
                    .from('assets')
                    .select('*')
                    .eq('id', asset.id)
                    .single()
                    .then(({ data, error }) => {
                        if (!error && data) {
                            const freshAsset = data as AssetWithMuxData;

                            // Check if transcript status or content changed
                            const transcriptStatusChanged =
                                'transcript_processing_status' in freshAsset &&
                                'transcript_processing_status' in asset &&
                                freshAsset.transcript_processing_status !== asset.transcript_processing_status;

                            const transcriptTextChanged =
                                'transcript_text' in freshAsset &&
                                (!('transcript_text' in asset) ||
                                    freshAsset.transcript_text !== asset.transcript_text);

                            if (transcriptStatusChanged || transcriptTextChanged) {
                                console.log(`[ASSET MODAL] Manual refresh detected transcript change:`,
                                    transcriptStatusChanged ?
                                        `Status: ${asset.transcript_processing_status} → ${freshAsset.transcript_processing_status}` : '',
                                    transcriptTextChanged ?
                                        `Text: ${freshAsset.transcript_text ? 'received' : 'none'}` : '');

                                setAsset(freshAsset);

                                // If transcript is completed or error, clear the timer
                                if (freshAsset.transcript_processing_status === 'completed' ||
                                    freshAsset.transcript_processing_status === 'error') {
                                    if (refreshTimer) {
                                        console.log(`[ASSET MODAL] Clearing transcript check timer`);
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

    // Update editable state when the underlying asset changes (e.g., due to realtime updates)
    useEffect(() => {
        setEditableName(asset.name || '');
        setEditableDescription(asset.description || '');
        setEditableValue(asset.estimated_value != null ? String(asset.estimated_value) : '');
        // Update current room and tags if the initialAsset prop changes (e.g. parent re-renders with new data)
        setCurrentRoomId(initialAsset.room?.id || "");
        setCurrentTagIds(initialAsset.tags?.map(t => t.id) || []);
    }, [asset, initialAsset]);


    // Debounced save function for name, description, value
    const debouncedSave = useDebouncedCallback(async () => {
        if (!editableName) {
            setSaveError('Name cannot be empty.');
            return;
        }
        const valueToSave = editableValue.trim() === '' ? null : parseFloat(editableValue);
        if (editableValue.trim() !== '' && (isNaN(valueToSave!) || valueToSave! < 0)) {
            setSaveError('Invalid estimated value. Must be a non-negative number.');
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            const updates = {
                name: editableName,
                description: editableDescription || null,
                estimated_value: valueToSave
            };
            const { data: updatedDbAsset, error } = await supabase
                .from('assets')
                .update(updates)
                .eq('id', asset.id)
                .select('*, tags(id,name), rooms(id,name)') // Re-fetch relations
                .single();

            if (error) throw error;
            
            if (updatedDbAsset) {
                 const processedAsset = {
                    ...updatedDbAsset,
                    room: Array.isArray(updatedDbAsset.rooms) ? updatedDbAsset.rooms[0] : updatedDbAsset.rooms,
                    tags: updatedDbAsset.tags || []
                } as AssetWithMuxData;
                setAsset(processedAsset); // Update local state with full asset from DB
                onAssetUpdate(processedAsset); // Propagate to parent
            }
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (error) {
            console.error('Error saving asset details:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            setSaveError(`Save failed: ${message}`);
        } finally {
            setIsSaving(false);
        }
    }, 500);

    useEffect(() => {
        if (initialAsset && (editableName !== initialAsset.name ||
            editableDescription !== (initialAsset.description || '') ||
            editableValue !== (initialAsset.estimated_value != null ? String(initialAsset.estimated_value) : ''))) {
            debouncedSave();
        }
    }, [editableName, editableDescription, editableValue, initialAsset, debouncedSave]);
    
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
            // Handle item deletion (only delete from DB)
            if (isItem) {
                console.log(`Deleting item asset (DB only): ${asset.id}`)
                const { error: dbError } = await supabase
                    .from('assets')
                    .delete()
                    .eq('id', asset.id)

                if (dbError) {
                    console.error('Error deleting item asset from database:', dbError);
                    throw dbError;
                }
            }
            // Handle source video/image deletion (Mux API or S3 API)
            else if (hasMuxData && asset.mux_asset_id) { // Ensure we have the mux_asset_id for source videos
                console.log(`Deleting source Mux asset: ${asset.id} (Mux ID: ${asset.mux_asset_id})`);
                // Delete using the Mux API endpoint
                const response = await fetch('/api/mux/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    // Pass the Supabase asset ID, the API route will find the Mux asset ID
                    body: JSON.stringify({ assetId: asset.id }),
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to delete Mux asset');
                }
            } else if (asset.media_type === 'image' && asset.media_url) {
                console.log(`Deleting image asset (DB & S3): ${asset.id}`);
                // For non-Mux images, delete from Supabase and S3
                const { error: dbError } = await supabase
                    .from('assets')
                    .delete()
                    .eq('id', asset.id)

                if (dbError) throw dbError

                // Delete from S3
                const key = asset.media_url.split('/').pop()
                if (key) { // Ensure we have a key
                    const response = await fetch('/api/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ key }),
                    })
                    if (!response.ok) {
                        // Log S3 deletion error but maybe don't block UI update?
                        console.error('Failed to delete file from S3, but DB record deleted.')
                        // throw new Error('Failed to delete file from S3') 
                    }
                } else {
                    console.warn('Could not determine S3 key from media_url for deletion.')
                }
            } else {
                console.warn(`Cannot determine deletion method for asset ${asset.id} of type ${asset.media_type}`);
                throw new Error('Unsupported asset type for deletion.');
            }

            onDelete?.(asset.id) // Notify parent (e.g., dashboard) via prop
            onClose() // Close the modal
        } catch (error) {
            console.error('Error deleting asset:', error)
            alert(`Failed to delete asset: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`)
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

    // Determine media URL dynamically for rendering (mostly needed for non-player images now)
    // This is primarily for the regular <Image> tag if needed as a fallback.
    // The MuxPlayer component itself will handle fetching based on playbackId.
    let displayImageUrl = '';
    if (isItem && asset.mux_playback_id && asset.item_timestamp != null) {
        // Pass the fetched modalToken to the URL function
        displayImageUrl = getMuxThumbnailUrl(asset.mux_playback_id, modalToken);
    } else if (asset.media_type === 'image') {
        displayImageUrl = asset.media_url;
    } else if (isVideo && asset.mux_playback_id && isMuxReady) {
        // Use token for the main video thumbnail too (timestamp 0)
        displayImageUrl = getMuxThumbnailUrl(asset.mux_playback_id, modalToken);
    }

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" role="dialog" aria-label="Asset Details" aria-modal="true">
                <div className="fixed inset-0 w-full h-full sm:inset-[50%] sm:w-full sm:max-w-3xl sm:h-[90vh] sm:translate-x-[-50%] sm:translate-y-[-50%] bg-background rounded-none sm:rounded-lg shadow-lg flex flex-col">
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
                            {/* Media Display */}
                            <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                                {isLoadingToken ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">Loading preview...</div>
                                ) : isItem && asset.mux_playback_id && asset.item_timestamp != null ? (
                                    // Display Item using MuxPlayer starting at the timestamp
                                    <MuxPlayer
                                        playbackId={asset.mux_playback_id}
                                        title={asset.name}
                                        aspectRatio={asset.mux_aspect_ratio || '1/1'}
                                        startTime={asset.item_timestamp} // Start playback at the item timestamp
                                        itemTimestamp={asset.item_timestamp} // Pass timestamp for initial thumbnail token
                                    />
                                ) : isVideo && asset.mux_playback_id && isMuxReady ? (
                                    // Display Source Video using MuxPlayer
                                    <MuxPlayer
                                        playbackId={asset.mux_playback_id}
                                        title={asset.name}
                                        aspectRatio={asset.mux_aspect_ratio || '16/9'}
                                        startTime={0} // Start source videos from the beginning
                                    />
                                ) : isVideo && isMuxProcessing ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <p>Video is processing...</p>
                                    </div>
                                ) : asset.media_type === 'image' ? (
                                    // Display Regular Image
                                    displayImageUrl ? (
                                        <div className="relative w-full h-full">
                                            <Image
                                                key={displayImageUrl} // Use URL as key
                                                src={displayImageUrl}
                                                alt={asset.name}
                                                fill
                                                className="object-contain"
                                                sizes="(max-width: 768px) 100vw, 50vw"
                                                priority
                                                onError={(e) => console.error(`Modal image error for ${asset.id}:`, e)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted-foreground">Image Unavailable</div>
                                    )
                                ) : (
                                    // Fallback for unexpected states
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        {isItem ? 'Item Media Unavailable' : 'Media Unavailable'}
                                    </div>
                                )}
                            </div>
                            {/* Details Column */}
                            <div className="space-y-4">
                                {/* Editable Name */}
                                <div>
                                    <Label htmlFor="asset-name" className="font-medium mb-1 block">Name</Label>
                                    <Input
                                        id="asset-name"
                                        value={editableName}
                                        onChange={(e) => setEditableName(e.target.value)}
                                        placeholder="Item Name"
                                    />
                                </div>

                                {/* Editable Description */}
                                <div>
                                    <Label htmlFor="asset-description" className="font-medium mb-1 block">Description</Label>
                                    <Textarea
                                        id="asset-description"
                                        value={editableDescription}
                                        onChange={(e) => setEditableDescription(e.target.value)}
                                        placeholder="Item description..."
                                        rows={3}
                                    />
                                </div>

                                {/* Editable Estimated Value */}
                                <div>
                                    <Label htmlFor="asset-value" className="font-medium mb-1 block">Estimated Value ($)</Label>
                                    <Input
                                        id="asset-value"
                                        type="number"
                                        value={editableValue}
                                        onChange={(e) => setEditableValue(e.target.value)}
                                        placeholder="e.g., 199.99"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>

                                {/* Save Status Indicator */}
                                <div className="h-4 text-sm">
                                    {isSaving && <span className="text-muted-foreground italic">Saving...</span>}
                                    {saveError && <span className="text-destructive">{saveError}</span>}
                                    {saveSuccess && <span className="text-green-600">Saved!</span>}
                                </div>

                                {asset.description && (
                                    <div>
                                        <h3 className="font-medium mb-2">Description</h3>
                                        <p className="text-muted-foreground whitespace-pre-line">{asset.description}</p>
                                    </div>
                                )}
                                {asset.estimated_value && (
                                    <div>
                                        <h3 className="font-medium mb-2">Estimated Value</h3>
                                        <p className="text-muted-foreground">{formatCurrency(asset.estimated_value)}</p>
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
                                {/* Transcript Section */}
                                {'transcript_processing_status' in asset && asset.transcript_processing_status && (
                                    <div>
                                        <h3 className="font-medium mb-2">Transcript Status</h3>
                                        <p className="text-muted-foreground">
                                            {asset.transcript_processing_status === 'pending'
                                                ? 'Pending'
                                                : asset.transcript_processing_status === 'processing'
                                                    ? 'Processing (please wait)'
                                                    : asset.transcript_processing_status === 'completed'
                                                        ? 'Completed'
                                                        : 'Error'}
                                        </p>
                                        {asset.transcript_error && (
                                            <p className="text-red-500 text-sm mt-1">{asset.transcript_error}</p>
                                        )}
                                    </div>
                                )}
                                {/* Show transcript if available */}
                                {'transcript_text' in asset && asset.transcript_text && (
                                    <div>
                                        <h3 className="font-medium mb-2">Transcript</h3>
                                        <div className="max-h-60 overflow-y-auto bg-muted p-3 rounded-md">
                                            <p className="text-muted-foreground whitespace-pre-line text-sm">
                                                {asset.transcript_text}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Room Management */}
                                <div className="mt-4">
                                    <Label htmlFor="asset-room" className="font-medium mb-1 block">Room</Label>
                                    <Select
                                        value={currentRoomId}
                                        onValueChange={async (newRoomId) => {
                                            setIsUpdatingRoom(true);
                                            setRoomUpdateError(null);
                                            const oldRoomId = currentRoomId;
                                            setCurrentRoomId(newRoomId || ""); // Update UI immediately

                                            try {
                                                let updatedDbAsset;
                                                if (newRoomId && newRoomId !== "") {
                                                    const response = await fetch(`/api/assets/${asset.id}/room`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ room_id: newRoomId }),
                                                    });
                                                    if (!response.ok) throw new Error(await response.text());
                                                    // Fetch the updated asset to get new room name
                                                } else if (oldRoomId !== "") { // Only delete if there was a room
                                                    const response = await fetch(`/api/assets/${asset.id}/room`, { method: 'DELETE' });
                                                    if (!response.ok) throw new Error(await response.text());
                                                }
                                                
                                                // Re-fetch asset to get updated relations
                                                const { data, error } = await supabase.from('assets').select('*, tags(id,name), rooms(id,name)').eq('id', asset.id).single();
                                                if (error) throw error;
                                                updatedDbAsset = data;

                                                if (updatedDbAsset) {
                                                    const processedAsset = {
                                                        ...updatedDbAsset,
                                                        room: Array.isArray(updatedDbAsset.rooms) ? updatedDbAsset.rooms[0] : updatedDbAsset.rooms,
                                                        tags: updatedDbAsset.tags || []
                                                    } as AssetWithMuxData;
                                                    setAsset(processedAsset);
                                                    onAssetUpdate(processedAsset);
                                                    setCurrentRoomId(processedAsset.room?.id || "");
                                                }
                                            } catch (e: any) {
                                                setRoomUpdateError(e.message || 'Failed to update room');
                                                setCurrentRoomId(oldRoomId); // Revert UI on error
                                            } finally {
                                                setIsUpdatingRoom(false);
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a room" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">No Room</SelectItem>
                                            {availableRooms.map(room => (
                                                <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {isUpdatingRoom && <p className="text-xs text-muted-foreground mt-1">Updating room...</p>}
                                    {roomUpdateError && <p className="text-xs text-destructive mt-1">{roomUpdateError}</p>}
                                </div>

                                {/* Tag Management */}
                                <div className="mt-4">
                                    <Label className="font-medium mb-1 block">Tags</Label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {asset.tags?.map(tag => (
                                            <Badge key={tag.id} variant="secondary" className="flex items-center gap-1">
                                                {tag.name}
                                                <button
                                                    onClick={async () => {
                                                        setIsUpdatingTags(true);
                                                        setTagsUpdateError(null);
                                                        try {
                                                            const response = await fetch(`/api/assets/${asset.id}/tags`, {
                                                                method: 'DELETE',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ tag_id: tag.id }),
                                                            });
                                                            if (!response.ok) throw new Error('Failed to remove tag');
                                                            
                                                            // Update local state
                                                            const updatedTags = asset.tags?.filter(t => t.id !== tag.id) || [];
                                                            const updatedAsset = { ...asset, tags: updatedTags };
                                                            setAsset(updatedAsset);
                                                            setCurrentTagIds(updatedTags.map(t => t.id));
                                                            onAssetUpdate(updatedAsset);

                                                        } catch (e: any) {
                                                            setTagsUpdateError(e.message || 'Failed to remove tag');
                                                        } finally {
                                                            setIsUpdatingTags(false);
                                                        }
                                                    }}
                                                    className="ml-1 text-muted-foreground hover:text-foreground"
                                                    aria-label={`Remove tag ${tag.name}`}
                                                >
                                                    &times;
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <select
                                            multiple
                                            value={tagsToAdd}
                                            onChange={(e) => setTagsToAdd(Array.from(e.target.selectedOptions, option => option.value))}
                                            className="block w-full pl-3 pr-10 py-2 text-base border-input bg-background hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring sm:text-sm rounded-md shadow-sm h-20"
                                        >
                                            {availableTags.filter(at => !currentTagIds.includes(at.id)).map(tag => (
                                                <option key={tag.id} value={tag.id}>{tag.name}</option>
                                            ))}
                                        </select>
                                        <Button
                                            size="sm"
                                            onClick={async () => {
                                                if (tagsToAdd.length === 0) return;
                                                setIsUpdatingTags(true);
                                                setTagsUpdateError(null);
                                                let success = true;
                                                for (const tagId of tagsToAdd) {
                                                    try {
                                                        const response = await fetch(`/api/assets/${asset.id}/tags`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ tag_id: tagId }),
                                                        });
                                                        if (!response.ok && response.status !== 409) { // 409 means already associated, which is fine
                                                            throw new Error(`Failed to add tag ${availableTags.find(t=>t.id === tagId)?.name || tagId}`);
                                                        }
                                                    } catch (e) {
                                                        console.error(e);
                                                        setTagsUpdateError((prev) => (prev ? `${prev}, ${e instanceof Error ? e.message : String(e)}` : `${e instanceof Error ? e.message : String(e)}`));
                                                        success = false;
                                                    }
                                                }
                                                // Re-fetch asset to get updated relations
                                                const { data: updatedDbAsset, error: fetchError } = await supabase.from('assets').select('*, tags(id,name), rooms(id,name)').eq('id', asset.id).single();
                                                if (fetchError) {
                                                    setTagsUpdateError((prev) => (prev ? `${prev}, Failed to refresh asset` : 'Failed to refresh asset'));
                                                } else if (updatedDbAsset) {
                                                     const processedAsset = {
                                                        ...updatedDbAsset,
                                                        room: Array.isArray(updatedDbAsset.rooms) ? updatedDbAsset.rooms[0] : updatedDbAsset.rooms,
                                                        tags: updatedDbAsset.tags || []
                                                    } as AssetWithMuxData;
                                                    setAsset(processedAsset);
                                                    onAssetUpdate(processedAsset);
                                                    setCurrentTagIds(processedAsset.tags?.map(t => t.id) || []);
                                                }
                                                setTagsToAdd([]); // Clear selection
                                                setIsUpdatingTags(false);
                                                if(success && !tagsUpdateError) setTagsUpdateError(null); // Clear error if all successful
                                            }}
                                            disabled={isUpdatingTags || tagsToAdd.length === 0}
                                        >
                                            Add Tag(s)
                                        </Button>
                                    </div>
                                    {isUpdatingTags && <p className="text-xs text-muted-foreground mt-1">Updating tags...</p>}
                                    {tagsUpdateError && <p className="text-xs text-destructive mt-1">{tagsUpdateError}</p>}
                                </div>


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