'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';

// Dynamically import the Mux Player component to avoid any SSR issues
const MuxPlayerComponent = dynamic(
    () => import('@mux/mux-player-react'),
    { ssr: false }
);

interface MuxPlayerProps {
    playbackId: string;
    aspectRatio?: string;
    poster?: string;
    title?: string;
}

export function MuxPlayer({ playbackId, aspectRatio = '16/9', poster, title }: MuxPlayerProps) {
    const [jwt, setJwt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        async function fetchJwt() {
            try {
                setLoading(true);

                // Get a signed JWT for this playback ID
                const response = await fetch(`/api/mux/token?playbackId=${playbackId}`);

                if (!response.ok) {
                    throw new Error('Failed to get playback token');
                }

                const { token } = await response.json();
                setJwt(token);
            } catch (err) {
                console.error('Error fetching JWT for playback:', err);
                setError(err instanceof Error ? err.message : 'Failed to load video');
            } finally {
                setLoading(false);
            }
        }

        if (playbackId) {
            fetchJwt();
        }
    }, [playbackId]);

    if (error) {
        return (
            <div className="flex items-center justify-center bg-muted h-full w-full rounded-lg">
                <div className="text-center p-4">
                    <p className="text-destructive mb-2">Failed to load video</p>
                    <p className="text-sm text-muted-foreground">{error}</p>
                </div>
            </div>
        );
    }

    if (loading || !jwt) {
        return (
            <div className="flex items-center justify-center bg-muted h-full w-full rounded-lg">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading video...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="h-full w-full overflow-hidden rounded-lg"
            style={{ aspectRatio }}
        >
            <MuxPlayerComponent
                playbackId={playbackId}
                tokens={{ playback: jwt }}
                style={{
                    height: "100%",
                    width: "100%"
                }}
                onError={(error: any) => {
                    console.error('Mux player error:', error);
                    setError('Video playback error. Please try again later.');
                }}
            />
        </div>
    );
} 