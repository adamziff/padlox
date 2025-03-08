'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';

// Dynamically import the Mux Player component to avoid any SSR issues
const MuxPlayerComponent = dynamic(
    () => import('@mux/mux-player-react').then(mod => {
        console.log('Mux Player loaded successfully');
        return mod;
    }).catch(err => {
        console.error('Error loading @mux/mux-player-react:', err);
        return () => <div>Error loading player</div>;
    }),
    { ssr: false }
);

interface MuxPlayerProps {
    playbackId: string;
    aspectRatio?: string;
    poster?: string;
    title?: string;
}

export function MuxPlayer({ playbackId, aspectRatio = '16/9', poster, title }: MuxPlayerProps) {
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
    const playerRef = useRef<any>(null);
    const supabase = createClient();

    // Function to fetch the JWT tokens
    async function fetchTokens() {
        try {
            setLoading(true);
            setError(null);

            // Get signed JWTs for this playback ID
            console.log(`Requesting JWT tokens for playbackId: ${playbackId} (attempt ${retryCount + 1})`);

            // Add a cache-busting parameter to prevent caching issues
            const response = await fetch(`/api/mux/token?playbackId=${playbackId}&_=${Date.now()}`);

            if (!response.ok) {
                let errorMessage = `${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } catch { }
                throw new Error(`Failed to get playback token: ${errorMessage}`);
            }

            const data = await response.json();

            // Debug logging for the response
            console.log('Token API response structure:', Object.keys(data));
            console.log('Has tokens object:', !!data.tokens);
            console.log('Has token property:', !!data.token);

            // Test the URL that will be constructed
            if (data.token) {
                const testUrl = `https://stream.mux.com/${playbackId}.m3u8?token=${data.token}`;
                console.log('Example stream URL that will be used:',
                    testUrl.substring(0, 50) + '...' + testUrl.substring(testUrl.length - 20));
            }

            if (!data.token && (!data.tokens || !data.tokens.playback)) {
                throw new Error('No valid token in response');
            }

            // Check if we have all tokens or just the main one
            if (data.tokens && data.tokens.playback) {
                console.log('Using separate RSA-signed tokens for different purposes');

                // Log token previews for debugging (first and last 10 chars)
                const previewToken = (token: string) => token ?
                    `${token.substring(0, 10)}...${token.substring(token.length - 10)}` : 'undefined';

                console.log('RSA token previews:');
                console.log('- Playback:', previewToken(data.tokens.playback));
                console.log('- Thumbnail:', previewToken(data.tokens.thumbnail));
                console.log('- Storyboard:', previewToken(data.tokens.storyboard));

                setTokens({
                    playback: data.tokens.playback,
                    thumbnail: data.tokens.thumbnail,
                    storyboard: data.tokens.storyboard
                });
            } else if (data.token) {
                // Set all token types to the same token for backward compatibility
                console.log('Using single token for all purposes');
                console.log('Token preview:', `${data.token.substring(0, 10)}...${data.token.substring(data.token.length - 10)}`);

                setTokens({
                    playback: data.token,
                    thumbnail: data.token,
                    storyboard: data.token
                });
            }

            return data.token || (data.tokens && data.tokens.playback);
        } catch (err) {
            console.error('Error fetching JWT for playback:', err);
            setError(err instanceof Error ? err.message : 'Failed to load video');
            return null;
        } finally {
            setLoading(false);
        }
    }

    // Initial fetch on mount
    useEffect(() => {
        if (playbackId) {
            fetchTokens();
        } else {
            setError('No playback ID provided');
            setLoading(false);
        }
    }, [playbackId, retryCount]);

    // Function to retry loading
    const handleRetry = () => {
        console.log('Retrying token fetch and player loading');
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
                ref={playerRef}
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
                onError={(error: any) => {
                    console.error('Mux player error:', error);

                    // Log the entire error object to see what's happening
                    console.error('Full error object:', JSON.stringify(error, null, 2));

                    // Check if it's an auth error
                    const errorMsg = error?.message || error?.toString() || '';
                    const isAuthError =
                        errorMsg.includes('Authorization') ||
                        errorMsg.includes('auth') ||
                        errorMsg.includes('token') ||
                        errorMsg.includes('403');

                    if (isAuthError) {
                        console.error("Authentication error detected:", errorMsg);
                        console.log("URL should look like: https://stream.mux.com/" + playbackId + ".m3u8?token=[JWT]");
                        console.log("Retrying with fresh tokens...");
                        handleRetry();
                    } else {
                        setError('Video playback error. Please try again later.');
                    }
                }}
                onLoadStart={() => {
                    console.log('Mux player load started with tokens:', {
                        hasPlaybackToken: !!tokens.playback,
                        hasThumbnailToken: !!tokens.thumbnail,
                        hasStoryboardToken: !!tokens.storyboard
                    });

                    // Log the kind of URL that will be created
                    console.log(`Player will use: https://stream.mux.com/${playbackId}.m3u8?token=[JWT]`);
                }}
                onLoadedData={() => {
                    console.log('Mux player loaded data successfully');
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
                debug={true} // Enable debug mode to see more information in the console
            />
        </div>
    );
} 