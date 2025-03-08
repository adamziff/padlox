'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Helper for controlled logging - only log when DEBUG is set
function log(message: string, ...args: unknown[]) {
    if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log(`[MuxPlayer] ${message}`, ...args);
    }
}

// Create fallback component with display name
const FallbackComponent = () => <div>Error loading player</div>;
FallbackComponent.displayName = 'MuxPlayerFallback';

// Dynamically import the Mux Player component to avoid any SSR issues
const MuxPlayerComponent = dynamic(
    () => import('@mux/mux-player-react').then(mod => {
        log('Mux Player loaded successfully');
        return mod;
    }).catch(err => {
        console.error('Error loading @mux/mux-player-react:', err);
        return FallbackComponent;
    }),
    { ssr: false }
);

// Add display name to the component
MuxPlayerComponent.displayName = 'MuxPlayerComponent';

interface MuxPlayerProps {
    playbackId: string;
    aspectRatio?: string;
    poster?: string;
    title?: string;
}

export function MuxPlayer({ playbackId, aspectRatio = '16/9', title }: MuxPlayerProps) {
    const [tokens, setTokens] = useState<{
        playback: string | undefined;
        thumbnail: string | undefined;
        storyboard: string | undefined;
    }>({
        playback: undefined,
        thumbnail: undefined,
        storyboard: undefined
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [lastTokenFetchTime, setLastTokenFetchTime] = useState<number>(0);

    // Function to fetch the JWT tokens
    const fetchTokens = useCallback(async () => {
        try {
            // Don't fetch tokens too frequently (prevent rate limiting)
            const now = Date.now();
            if (now - lastTokenFetchTime < 5000 && lastTokenFetchTime > 0 && retryCount < 3) {
                log(`Skipping token fetch, last fetch was ${(now - lastTokenFetchTime) / 1000}s ago`);
                return;
            }

            setLastTokenFetchTime(now);
            setLoading(true);
            setError(null);

            // Get signed JWTs for this playback ID
            log(`Requesting tokens for playbackId: ${playbackId} (retry ${retryCount})`);

            // Add a cache-busting parameter to prevent caching issues
            const response = await fetch(`/api/mux/token?playbackId=${playbackId}&_=${Date.now()}`);

            if (!response.ok) {
                let errorMessage = `${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMessage += `: ${errorData.message || 'Unknown error'}`;
                    log(`Token API error: ${errorMessage}`);
                } catch (e) {
                    // If we can't parse the error as JSON, just use the status text
                }
                throw new Error(`Failed to fetch token: ${errorMessage}`);
            }

            const data = await response.json();

            // Check if we received tokens
            if (!data.token && (!data.tokens || !data.tokens.playback)) {
                throw new Error('No playback token returned from API');
            }

            log(`Tokens received successfully for ${playbackId}`);

            // Set tokens based on what the API returns
            if (data.tokens) {
                log('Using separate tokens for playback, thumbnail, and storyboard');
                setTokens({
                    playback: data.tokens.playback,
                    thumbnail: data.tokens.thumbnail,
                    storyboard: data.tokens.storyboard
                });
            } else {
                // Backward compatibility: Use the single token for all purposes
                log('Using single token for all purposes');
                setTokens({
                    playback: data.token,
                    thumbnail: data.token,
                    storyboard: data.token
                });
            }

            setError(null);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error fetching token';
            log(`Error fetching tokens: ${errorMessage}`);
            setError(`Failed to get video authorization: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    }, [playbackId, retryCount, lastTokenFetchTime]);

    // Initial fetch on mount and when retry is triggered
    useEffect(() => {
        if (playbackId) {
            fetchTokens();
        } else {
            setError('No playback ID provided');
            setLoading(false);
        }
    }, [playbackId, retryCount, fetchTokens]);

    // Function to retry loading
    const handleRetry = () => {
        log('Retrying token fetch');
        setRetryCount(count => count + 1);
    };

    // Handle loading and error states
    if (error) {
        return (
            <div className="flex items-center justify-center bg-muted h-full w-full rounded-lg">
                <div className="text-center p-4">
                    <p className="text-destructive mb-2">Failed to load video</p>
                    <p className="text-sm text-muted-foreground mb-4">{error}</p>
                    <button
                        onClick={handleRetry}
                        className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (loading || !tokens.playback) {
        return (
            <div className="flex items-center justify-center bg-muted h-full w-full rounded-lg">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading video...</p>
                </div>
            </div>
        );
    }

    // When we have tokens, pass them to the player
    return (
        <div
            className="h-full w-full overflow-hidden rounded-lg"
            style={{ aspectRatio }}
        >
            <MuxPlayerComponent
                playbackId={playbackId}
                streamType="on-demand"
                tokens={{
                    playback: tokens.playback,
                    thumbnail: tokens.thumbnail,
                    storyboard: tokens.storyboard
                }}
                style={{
                    height: "100%",
                    width: "100%"
                }}
                onError={(evt) => {
                    console.error('Mux player error:', evt);

                    // Check if it's an auth error
                    const errorMsg = evt.toString() || '';
                    const isAuthError =
                        errorMsg.includes('Authorization') ||
                        errorMsg.includes('auth') ||
                        errorMsg.includes('token') ||
                        errorMsg.includes('403');

                    if (isAuthError) {
                        log("Authentication error detected, retrying with fresh tokens");
                        handleRetry();
                    } else {
                        setError('Video playback error. Please try again later.');
                    }
                }}
                onLoadStart={() => {
                    log('Playback starting');
                }}
                onLoadedData={() => {
                    log('Video loaded successfully');
                }}
                metadata={{
                    video_id: playbackId,
                    video_title: title || 'Video',
                    player_name: 'Padlox Player',
                    player_version: '1.0.0',
                }}
                playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
                primaryColor="#0866FF"
                secondaryColor="#FFFFFF"
                autoPlay={false}
                preload="auto"
                muted={false}
                thumbnailTime={0}
                defaultHiddenCaptions={true}
                debug={false} // Disable debug mode in production
            />
        </div>
    );
} 