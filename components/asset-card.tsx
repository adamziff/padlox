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
    onCardClick,
    onCheckboxChange,
    onRetryMedia,
    onImageError,
}: AssetCardProps) {
    const isProcessingVideo = asset.media_type === 'video' && asset.mux_processing_status === 'preparing';
    const isItem = asset.media_type === 'item';
    const isClickable = !isProcessingVideo;

    // Determine the image source URL dynamically
    let imageUrl = '';
    let imageKey = asset.id; // Base key for React list

    if (isItem && asset.mux_playback_id && asset.item_timestamp != null) {
        imageUrl = getMuxThumbnailUrl(asset.mux_playback_id, asset.item_timestamp, thumbnailToken);
        imageKey = `${asset.id}-item-${thumbnailToken || 'no-token'}`;
    } else if (asset.media_type === 'video' && asset.mux_playback_id && asset.mux_processing_status === 'ready') {
        imageUrl = getMuxThumbnailUrl(asset.mux_playback_id, 0, thumbnailToken);
        imageKey = `${asset.id}-video-${thumbnailToken || 'no-token'}`;
    } else if (asset.media_type === 'image') {
        imageUrl = asset.media_url;
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

            {isProcessingVideo ? (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                        <div className="h-10 w-10 mx-auto mb-2 flex items-center justify-center">
                            <span className="animate-spin">
                                <SpinnerIcon />
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Video analysis in progress...</p>
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
            ) : imageUrl ? (
                <Image
                    key={imageKey}
                    src={imageUrl}
                    alt={asset.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                    onError={() => onImageError(asset.id, imageUrl, new Error('Image failed to load'))}
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    priority={false} // Generally false for grid items, maybe true for first few?
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
    );
} 