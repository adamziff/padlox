'use client'

import { AssetWithMuxData } from '@/types/mux'
import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase';
import { AssetModalHeader } from './asset-modal-parts/AssetModalHeader';
import { AssetMediaDisplay } from './asset-modal-parts/AssetMediaDisplay';
import { AssetDetailsForm } from './asset-modal-parts/AssetDetailsForm';
import { AssetRoomSelector } from './asset-modal-parts/AssetRoomSelector';
import { AssetTagsManager } from './asset-modal-parts/AssetTagsManager';

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
    asset: AssetWithMuxData | null;
    isOpen: boolean;
    onClose: () => void;
    onAssetDeleted: (assetId: string) => void;
    onAssetUpdated: (updatedAsset: AssetWithMuxData) => void; // Callback to update asset list
    fetchAndUpdateAssetState?: (assetId: string) => Promise<void>;
    availableRooms: Room[];
    availableTags: Tag[];
    onThumbnailRegenerate?: (assetId: string, newTimestamp: number) => void; // Callback to regenerate thumbnails
}

export function AssetModal({
    asset: initialAsset,
    isOpen,
    onClose,
    onAssetDeleted,
    onAssetUpdated,
    fetchAndUpdateAssetState,
    availableRooms,
    availableTags,
    onThumbnailRegenerate
}: AssetModalProps) {
    const [asset, setAsset] = useState<AssetWithMuxData | null>(initialAsset);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoadingMuxTokens, setIsLoadingMuxTokens] = useState(false);
    const [muxPlaybackToken, setMuxPlaybackToken] = useState<string | null>(null);

    useEffect(() => {
        setAsset(initialAsset);
        setCurrentTimestamp(initialAsset?.item_timestamp ?? null);
        if (initialAsset) {
            setMuxPlaybackToken(null);
        } else {
            setMuxPlaybackToken(null);
        }
    }, [initialAsset]);

    // Track the current timestamp to detect changes
    const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(
        initialAsset?.item_timestamp ?? null
    );

    useEffect(() => {
        if (isOpen && asset && asset.mux_playback_id && !isLoadingMuxTokens) {
            // Check if we need to fetch a new token
            const needsNewToken = !muxPlaybackToken ||
                (asset.media_type === 'item' && asset.item_timestamp !== currentTimestamp);

            if (needsNewToken) {
                setIsLoadingMuxTokens(true);
                setCurrentTimestamp(asset.item_timestamp ?? null);

                fetch(`/api/mux/token?playbackId=${asset.mux_playback_id}${asset.item_timestamp ? `&time=${asset.item_timestamp}` : ''}&_=${Date.now()}`)
                    .then(res => {
                        if (!res.ok) throw new Error('Failed to fetch Mux tokens');
                        return res.json();
                    })
                    .then(data => {
                        if (data.tokens) {
                            setMuxPlaybackToken(data.tokens.playback);
                        } else if (data.token) {
                            setMuxPlaybackToken(data.token);
                        }
                        if (!data.tokens && !data.token) {
                            throw new Error('No tokens returned from API');
                        }
                    })
                    .catch(err => {
                        console.error("Error fetching Mux tokens:", err);
                        toast.error("Could not load video details: " + (err.message || ''));
                    })
                    .finally(() => setIsLoadingMuxTokens(false));
            }
        }
    }, [isOpen, asset, asset?.item_timestamp, muxPlaybackToken, isLoadingMuxTokens, currentTimestamp]);

    const handleInternalAssetUpdate = useCallback((updatedAsset: AssetWithMuxData) => {
        setAsset(updatedAsset);
        onAssetUpdated(updatedAsset);
    }, [onAssetUpdated]);

    const handleTimestampUpdate = useCallback(async (newTimestamp: number) => {
        if (!asset || asset.media_type !== 'item' || !asset.mux_playback_id) return;

        try {
            // Clear current token to force regeneration with new timestamp
            setMuxPlaybackToken(null);
            setCurrentTimestamp(newTimestamp);

            // Notify parent component to regenerate thumbnails in the asset grid
            if (onThumbnailRegenerate) {
                onThumbnailRegenerate(asset.id, newTimestamp);
            }

            toast.success('Preview timestamp updated successfully!');

            // The useEffect will handle fetching the new token automatically
            // when it detects the timestamp change
        } catch (error) {
            console.error('Error updating timestamp:', error);
            toast.error('Failed to update preview timestamp');
        }
    }, [asset, onThumbnailRegenerate]);

    const handleDelete = async () => {
        if (!asset) return;
        if (!window.confirm(`Are you sure you want to delete "${asset.name || 'Untitled'}"? This action cannot be undone.`)) return;

        setIsDeleting(true);
        try {
            console.log(`Processing deletion for asset ${asset.id}, type: ${asset.media_type}`);

            if (asset.media_type === 'item') {
                console.log(`Deleting item asset (DB only): ${asset.id}`);
                const supabase = createClient();
                const { error: dbError } = await supabase.from('assets').delete().eq('id', asset.id);
                if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                console.log(`[ASSET MODAL DELETE] Successfully deleted item asset ${asset.id} from database`);
            } else if (asset.media_type === 'video' && asset.mux_asset_id) {
                console.log(`Deleting source Mux asset via API: ${asset.id}`);
                const response = await fetch('/api/mux/delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assetId: asset.id }),
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `Mux API delete failed (${response.status})`);
                }
            } else if (asset.media_type === 'image' && asset.media_url && !asset.mux_asset_id) {
                console.log(`Deleting S3 image asset (DB & S3): ${asset.id}`);
                const supabase = createClient();
                const { error: dbError } = await supabase.from('assets').delete().eq('id', asset.id);
                if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                console.log(`[ASSET MODAL DELETE] Successfully deleted image asset ${asset.id} from database`);

                const key = asset.media_url.split('/').pop();
                if (key) {
                    const response = await fetch('/api/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key })
                    });
                    if (!response.ok) console.error(`Failed to delete S3 object for key ${key}, but DB record deleted.`);
                } else console.warn(`Could not determine S3 key for asset ${asset.id}`);
            } else {
                console.warn(`Unsupported asset type or state for deletion: ${asset.id}, type: ${asset.media_type}, mux: ${!!asset.mux_asset_id}`);
                throw new Error('Unsupported asset type for deletion.');
            }

            console.log(`Successfully processed deletion for asset ${asset.id}`);
            toast.success(`Asset "${asset.name || 'Untitled'}" deleted successfully.`);

            // Give a small delay to ensure the realtime subscription picks up the delete
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log(`[ASSET MODAL DELETE] Calling onAssetDeleted callback for asset ${asset.id}`);
            onAssetDeleted(asset.id);
            onClose(); // Close modal after deletion
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error deleting asset ${asset.id}:`, errorMessage);
            toast.error(`Error deleting asset: ${errorMessage}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDownload = () => {
        if (!asset || !asset.media_url || asset.mux_asset_id) return; // No download for Mux videos from here for now
        // For direct S3 links or other non-Mux uploads
        const link = document.createElement('a');
        link.href = asset.media_url.startsWith('http') ? asset.media_url : `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`;
        link.download = asset.name || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen || !asset) {
        console.log('[AssetModal] Condition (!isOpen || !asset) is TRUE, returning null. isOpen:', isOpen, 'internal asset state:', asset);
        return null;
    }

    // These definitions are correct and should be the only ones for these constants.
    const isMuxAsset = asset.mux_asset_id ? true : false;
    const activeProcessingStates = ['preparing', 'processing'];
    const isMuxProcessing = isMuxAsset && asset.mux_processing_status && activeProcessingStates.includes(asset.mux_processing_status);
    const isMuxReady = isMuxAsset && asset.mux_processing_status === 'ready';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl p-0 min-h-[300px]">
                <AssetModalHeader
                    assetName={asset.name}
                    isDeleting={isDeleting}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                    onClose={onClose}
                    hasMuxData={asset.mux_asset_id ? true : false}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 max-h-[calc(100vh-120px)] md:max-h-[calc(100vh-70px-50px)]">
                    {/* Left Column: Media Display */}
                    <div className="md:col-span-1 bg-background flex items-center justify-center overflow-hidden md:max-h-[calc(100vh-120px)]">
                        <AssetMediaDisplay
                            asset={asset}
                            isLoadingToken={isLoadingMuxTokens}
                            isMuxReady={isMuxReady}
                            isMuxProcessing={Boolean(isMuxProcessing)}
                        />
                    </div>

                    {/* Right Column: Details, Tags, Room */}
                    <div className="md:col-span-1 p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto md:max-h-[calc(100vh-120px)]">
                        <AssetDetailsForm
                            asset={asset}
                            onAssetUpdate={handleInternalAssetUpdate}
                            onTimestampUpdate={handleTimestampUpdate}
                        />

                        <hr className="my-4" />

                        <AssetRoomSelector
                            asset={asset}
                            availableRooms={availableRooms}
                            onAssetUpdate={handleInternalAssetUpdate}
                            fetchAndUpdateAssetState={fetchAndUpdateAssetState}
                        />

                        <hr className="my-4" />

                        <AssetTagsManager
                            asset={asset}
                            availableTags={availableTags}
                            onAssetUpdate={handleInternalAssetUpdate}
                        />

                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}