'use client';

import { AssetWithMuxData } from '@/types/mux';
import { AssetCard } from './asset-card';
import React from 'react';

type AssetGridProps = {
    assets: AssetWithMuxData[];
    selectedAssets: Set<string>;
    isSelectionMode: boolean;
    thumbnailTokens: Record<string, string | null>;
    mediaErrors: Record<string, string>;
    onAssetClick: (asset: AssetWithMuxData, event: React.MouseEvent) => void;
    onCheckboxChange: (assetId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onRetryMedia: (assetId: string, event: React.MouseEvent) => void;
    onImageError: (assetId: string, imageUrl: string, error: Error) => void;
    fetchThumbnailToken: (playbackId: string) => Promise<string | null>;
};

export function AssetGrid({
    assets,
    selectedAssets,
    isSelectionMode,
    thumbnailTokens,
    mediaErrors,
    onAssetClick,
    onCheckboxChange,
    onRetryMedia,
    onImageError,
    fetchThumbnailToken
}: AssetGridProps) {

    const handleImageError = (
        assetId: string,
        imageUrl: string,
        error: Error
    ) => {
        const asset = assets.find(a => a.id === assetId);
        if (asset?.mux_playback_id && !thumbnailTokens[asset.mux_playback_id]) {
            console.warn(`Thumbnail failed for ${assetId} (no token), attempting token refetch.`);
            fetchThumbnailToken(asset.mux_playback_id);
        } else {
            console.error(`Final error loading image for ${assetId} URL: ${imageUrl}`, error);
            onImageError(assetId, imageUrl, error);
        }
    };

    // Filter assets before rendering
    const filteredAssets = assets.filter(asset => {
        // Always show items
        if (asset.media_type === 'item') {
            return true;
        }
        // Show videos only if their Mux status exists and is 'preparing' or 'processing'
        if (asset.media_type === 'video') {
            const status = asset.mux_processing_status;
            // Hide video if it's ready AND marked as the source video (implying items were generated)
            if (status === 'ready' && asset.is_source_video === true) {
                return false;
            }
            // Show video if it's preparing or processing
            if (status && (status === 'preparing' || status === 'processing')) {
                return true;
            }
        }
        // Hide all other cases
        return false;
    });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredAssets.map(asset => {
                const token = asset.mux_playback_id ? thumbnailTokens[asset.mux_playback_id] ?? null : null;
                const hasError = !!mediaErrors[asset.id];
                const isSelected = selectedAssets.has(asset.id);

                return (
                    <AssetCard
                        key={asset.id}
                        asset={asset}
                        isSelected={isSelected}
                        isSelectionMode={isSelectionMode}
                        thumbnailToken={token}
                        hasError={hasError}
                        onCardClick={onAssetClick}
                        onCheckboxChange={onCheckboxChange}
                        onRetryMedia={onRetryMedia}
                        onImageError={handleImageError}
                    />
                );
            })}
        </div>
    );
} 