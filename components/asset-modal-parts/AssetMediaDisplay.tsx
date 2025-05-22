'use client'

import Image from 'next/image';
import { MuxPlayer } from '@/components/mux-player';
import { AssetWithMuxData } from '@/types/mux';
// import { getMuxThumbnailUrl } from '@/lib/mux/index'; // Commented out due to persistent type issues

interface AssetMediaDisplayProps {
    asset: AssetWithMuxData;
    isLoadingToken: boolean;
    isMuxReady: boolean;
    isMuxProcessing: boolean;
}

export function AssetMediaDisplay({
    asset,
    isLoadingToken,
    isMuxReady,
    isMuxProcessing
}: AssetMediaDisplayProps) {

    const isItem = asset.media_type === 'item';
    const isVideo = asset.media_type === 'video';
    const hasMuxData = !!asset.mux_playback_id;

    let displayThumbnailUrl: string | undefined = undefined;

    // TODO: Resolve getMuxThumbnailUrl signature and uncomment the following:
    /*
    if (hasMuxData && asset.mux_playback_id) {
        const thumbnailOptions: {
            width: number;
            height: number;
            fit_mode: 'preserve' | 'crop' | 'stretch' | 'smartcrop';
            time?: number
        } = {
            width: 512,
            height: 512,
            fit_mode: 'crop',
        };
        if (isItem && asset.item_timestamp != null) {
            thumbnailOptions.time = asset.item_timestamp;
        }
        // displayThumbnailUrl = getMuxThumbnailUrl(asset.mux_playback_id, modalToken, thumbnailOptions);
    }
    */

    // Fallback or direct URL for images if Mux thumbnail logic is commented out
    if (asset.media_type === 'image' && asset.media_url) {
        displayThumbnailUrl = asset.media_url;
    } else if (hasMuxData && asset.mux_playback_id && !displayThumbnailUrl) {
        // Basic placeholder or attempt a non-signed URL if applicable (usually not for signed playback)
        // For now, this will likely mean Mux thumbnails won't show until the above is fixed.
    }

    return (
        <div className="relative w-full aspect-video bg-slate-800 flex items-center justify-center overflow-hidden">
            {(isLoadingToken && hasMuxData && !displayThumbnailUrl && !isMuxProcessing) && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white text-sm p-2 bg-black/50 rounded">Loading preview...</p>
                </div>
            )}

            {isMuxProcessing && hasMuxData && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <svg className="animate-spin h-8 w-8 text-white mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-white text-sm p-2 bg-black/50 rounded">
                        {asset.mux_processing_status === 'preparing' ? 'Preparing video...' : 'Processing video...'}
                    </p>
                </div>
            )}

            {(isItem || (isVideo && isMuxReady)) && asset.mux_playback_id && (
                <MuxPlayer
                    playbackId={asset.mux_playback_id}
                    startTime={asset.item_timestamp ?? undefined}
                    itemTimestamp={asset.item_timestamp ?? undefined}
                />
            )}

            {asset.media_type === 'image' && displayThumbnailUrl && (
                <Image
                    src={displayThumbnailUrl}
                    alt={asset.name || 'Asset image'}
                    layout="fill"
                    objectFit="contain"
                    unoptimized={displayThumbnailUrl.startsWith('blob:')}
                />
            )}

            {isVideo && !hasMuxData && asset.media_url && (
                <video controls src={asset.media_url} className="w-full h-full object-contain">
                    Your browser does not support the video tag.
                </video>
            )}

            {!isMuxProcessing && !(asset.media_type === 'image' && displayThumbnailUrl) && !((isItem || (isVideo && isMuxReady)) && asset.mux_playback_id) && !(isVideo && !hasMuxData && asset.media_url) && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white text-sm p-2 bg-black/50 rounded">Media preview not available.</p>
                </div>
            )}
        </div>
    );
} 