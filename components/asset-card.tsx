'use client';

import Image from 'next/image';
import { AssetWithMuxData } from '@/types/mux';
import { ImageIcon, VideoIcon, SpinnerIcon } from './icons';
import { formatCurrency } from '@/utils/format';
import { getMuxThumbnailUrl } from '@/lib/mux';
import React from 'react';

type AssetCardProps = {
    asset: AssetWithMuxData;
    isSelected: boolean;
    isSelectionMode: boolean;
    thumbnailToken: string | null;
    hasError: boolean;
    itemTimestamp?: number;
    onCardClick: (asset: AssetWithMuxData, event: React.MouseEvent) => void;
    onCheckboxChange: (assetId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
    onRetryMedia: (assetId: string, event: React.MouseEvent) => void;
    onImageError: (assetId: string, imageUrl: string, error: Error) => void;
};

export function AssetCard({
    asset,
    isSelected,
    isSelectionMode,
    thumbnailToken,
    hasError,
    itemTimestamp,
    onCardClick,
    onCheckboxChange,
    onRetryMedia,
    onImageError,
}: AssetCardProps) {
    // Always show loading spinner for video assets until transcription finishes and items appear
    const isVideoAsset = asset.media_type === 'video';
    const isItemAsset = asset.media_type === 'item';
    const isImageAsset = asset.media_type === 'image';

    // Determine clickability:
    // - Images are always clickable.
    // - Items (derived from videos) are always clickable.
    // - Videos are never clickable.
    const isClickable = isImageAsset || isItemAsset;

    // Determine if we should show a processing spinner:
    // Show spinner if it's a video asset and its Mux status is not 'ready'.
    // This includes 'preparing', 'processing', or if mux_asset_id is not yet available.
    const showProcessingSpinner = isVideoAsset && asset.mux_processing_status !== 'ready';

    // Determine the image source URL dynamically
    let imageUrl = '';
    let imageKey = asset.id; // Use a base key, modify for items with timestamps

    if (isItemAsset && asset.mux_playback_id && itemTimestamp != null) {
        imageUrl = getMuxThumbnailUrl(asset.mux_playback_id, thumbnailToken);
        // Stable key: Based on asset ID and timestamp (if applicable)
        imageKey = `${asset.id}-item-${itemTimestamp}`;
    } else if (isVideoAsset && asset.mux_playback_id && asset.mux_processing_status === 'ready') {
        // We do not load thumbnails for video assets; isProcessingVideo covers all videos
        // imageUrl = getMuxThumbnailUrl(asset.mux_playback_id, thumbnailToken);
        // imageKey = `${asset.id}-video`;
    } else if (isImageAsset) {
        imageUrl = asset.media_url;
        // Stable key: Based on asset ID for images
        imageKey = `${asset.id}-image`;
    }

    const handleCardClick = (event: React.MouseEvent) => {
        if (isClickable) {
            onCardClick(asset, event);
        }
    };

    const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onCheckboxChange(asset.id, event);
    };

    const handleRetryClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        onRetryMedia(asset.id, event);
    };

    return (
        <div
            className={`group relative aspect-square rounded-lg overflow-hidden bg-muted ${isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed'} transition-opacity ${isSelected ? 'ring-2 ring-primary' : ''}`}
            onClick={handleCardClick}
        >
            {isSelectionMode && (
                <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={handleCheckboxChange}
                        className="h-5 w-5 cursor-pointer"
                    />
                </div>
            )}

            {showProcessingSpinner ? (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                        <div className="h-10 w-10 mx-auto mb-2 flex items-center justify-center">
                            <span className="animate-spin">
                                <SpinnerIcon />
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Analyzing video...</p>
                    </div>
                </div>
            ) : hasError ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center p-4">
                        <p className="text-sm">Failed to load media</p>
                        <button
                            onClick={handleRetryClick}
                            className="text-xs text-primary hover:underline mt-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            ) : isVideoAsset ? (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                        <div className="h-10 w-10 mx-auto mb-2 flex items-center justify-center">
                            <span className="animate-spin">
                                <SpinnerIcon />
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Processing video... (let him cook)</p>
                    </div>
                </div>
            ) : imageUrl ? (
                imageUrl.includes('image.mux.com') ? (
                    thumbnailToken ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={imageKey}
                            src={imageUrl}
                            alt={asset.name}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={() => onImageError(asset.id, imageUrl, new Error('Mux image failed to load'))}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <span className="animate-spin"><SpinnerIcon /></span>
                        </div>
                    )
                ) : (
                    <Image
                        key={imageKey}
                        src={imageUrl}
                        alt={asset.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        onError={() => onImageError(asset.id, imageUrl, new Error('S3 image failed to load'))}
                        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        priority={false}
                    />
                )
            ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <p>Image Unavailable</p>
                </div>
            )}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 sm:p-4">
                <h3 className="text-white font-medium truncate text-sm sm:text-base">
                    {asset.name}
                </h3>
                {asset.estimated_value != null && (
                    <p className="text-white/90 text-xs sm:text-sm">
                        {formatCurrency(asset.estimated_value)}
                    </p>
                )}
                {asset.room && (
                    <p className="text-white/80 text-xs truncate mt-0.5">
                        Room: {asset.room.name}
                    </p>
                )}
                {asset.tags && asset.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {asset.tags.slice(0, 3).map(tag => ( // Show up to 3 tags
                            <span key={tag.id} className="px-1.5 py-0.5 text-xs bg-white/20 text-white rounded-md">
                                {tag.name}
                            </span>
                        ))}
                        {asset.tags.length > 3 && (
                            <span className="px-1.5 py-0.5 text-xs bg-white/20 text-white rounded-md">
                                +{asset.tags.length - 3} more
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1.5 z-10">
                {asset.media_type === 'video' ? <VideoIcon size={14} /> : <ImageIcon size={14} />}
            </div>
        </div>
    );
} 