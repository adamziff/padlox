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

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {assets.map(asset => {
                const isItem = asset.media_type === 'item';
                const timestamp = isItem && asset.item_timestamp != null ? asset.item_timestamp : undefined;
                const tokenKey = asset.mux_playback_id ?
                    (timestamp !== undefined ? `${asset.mux_playback_id}-${timestamp}` : asset.mux_playback_id)
                    : null;
                const token = tokenKey ? thumbnailTokens[tokenKey] ?? null : null;

                const hasError = !!mediaErrors[asset.id];
                const isSelected = selectedAssets.has(asset.id);

                return (
                    <AssetCard
                        key={asset.id}
                        asset={asset}
                        isSelected={isSelected}
                        isSelectionMode={isSelectionMode}
                        thumbnailToken={token}
                        itemTimestamp={timestamp}
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