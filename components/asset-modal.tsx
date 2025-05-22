'use client'

import { AssetWithMuxData } from '@/types/mux'
import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from 'sonner';
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
    availableRooms: Room[];
    availableTags: Tag[];
}

export function AssetModal({
    asset: initialAsset,
    isOpen,
    onClose,
    onAssetDeleted,
    onAssetUpdated,
    availableRooms,
    availableTags
}: AssetModalProps) {
    console.log('[AssetModal] Props received - isOpen:', isOpen, 'initialAsset:', initialAsset);
    const [asset, setAsset] = useState<AssetWithMuxData | null>(initialAsset);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoadingMuxTokens, setIsLoadingMuxTokens] = useState(false);
    const [muxPlaybackToken, setMuxPlaybackToken] = useState<string | null>(null);
    const [muxThumbnailToken, setMuxThumbnailToken] = useState<string | null>(null);

    useEffect(() => {
        console.log('[AssetModal] useEffect syncing internal asset state from initialAsset:', initialAsset);
        setAsset(initialAsset);
        if (initialAsset) {
            setMuxPlaybackToken(null);
            setMuxThumbnailToken(null);
        } else {
            setMuxPlaybackToken(null);
            setMuxThumbnailToken(null);
        }
    }, [initialAsset]);

    useEffect(() => {
        if (isOpen && asset && asset.mux_playback_id && !muxPlaybackToken && !isLoadingMuxTokens) {
            setIsLoadingMuxTokens(true);
            fetch(`/api/mux/token?playbackId=${asset.mux_playback_id}${asset.item_timestamp ? `&time=${asset.item_timestamp}` : ''}`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch Mux tokens');
                    return res.json();
                })
                .then(data => {
                    if (data.tokens) {
                        setMuxPlaybackToken(data.tokens.playback);
                        setMuxThumbnailToken(data.tokens.thumbnail);
                    } else if (data.token) {
                        setMuxPlaybackToken(data.token);
                        setMuxThumbnailToken(data.token);
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
    }, [isOpen, asset, muxPlaybackToken, isLoadingMuxTokens]);

    const handleInternalAssetUpdate = useCallback((updatedAsset: AssetWithMuxData) => {
        setAsset(updatedAsset);
        onAssetUpdated(updatedAsset);
    }, [onAssetUpdated]);

    const handleDelete = async () => {
        if (!asset) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/assets/${asset.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to delete asset' }));
                throw new Error(errorData.message);
            }
            toast.success(`Asset "${asset.name || 'Untitled'}" deleted successfully.`);
            onAssetDeleted(asset.id);
            onClose(); // Close modal after deletion
        } catch (error: unknown) { // Catch any error
            toast.error(`Error deleting asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    console.log('[AssetModal] Internal state before visibility check - asset:', asset, 'isOpen prop:', isOpen);

    if (!isOpen || !asset) {
        console.log('[AssetModal] Condition (!isOpen || !asset) is TRUE, returning null. isOpen:', isOpen, 'internal asset state:', asset);
        return null;
    }

    console.log('[AssetModal] Rendering Dialog. isOpen prop:', isOpen, 'internal asset state:', asset);

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
                            modalToken={muxThumbnailToken}
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
                        />

                        <hr className="my-4" />

                        <AssetRoomSelector
                            asset={asset}
                            availableRooms={availableRooms}
                            onAssetUpdate={handleInternalAssetUpdate}
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