import React, { LegacyRef } from 'react';
import { cn } from '@/lib/utils';
import { MicIcon } from 'lucide-react'; // Keep MicIcon here if narration hint stays

interface CameraViewProps {
    videoRef: LegacyRef<HTMLVideoElement | null>; // Allow null in LegacyRef type if needed, though useRef usually handles this
    canvasRef: React.RefObject<HTMLCanvasElement | null>; // Allow null
    facingMode: 'user' | 'environment';
    mode: 'photo' | 'video';
    recorderStatus: 'idle' | 'recording' | 'stopping' | 'error';
    countdown: number | null;
    errorMessage: string | null; // Needed to hide video on error
}

export function CameraView({ // Renamed to CameraView
    videoRef,
    canvasRef,
    facingMode,
    mode,
    recorderStatus,
    countdown,
    errorMessage,
}: CameraViewProps) {
    return (
        <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden">
            {/* Video Feed */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted // Keep muted to prevent feedback loops
                className={cn(
                    "w-full h-full object-contain",
                    facingMode === 'user' && "transform scale-x-[-1]", // Apply flip based on facingMode
                    (recorderStatus === 'error' && errorMessage) && "invisible" // Hide on error
                )}
                data-testid="camera-feed"
            />

            {/* Hidden Canvas for Photo Capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Narration Reminder Overlay */}
            {mode === 'video' && recorderStatus === 'recording' && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 px-3 py-1.5 bg-black/70 text-white rounded-md text-center shadow-lg text-xs sm:text-sm">
                    <p className="flex items-center gap-1">
                        <MicIcon className="w-3.5 h-3.5 flex-shrink-0" /> Speak clearly! Describe items.
                    </p>
                </div>
            )}

            {/* Countdown Timer Overlay */}
            {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
                    <div className="text-white text-8xl font-bold animate-pulse">
                        {countdown}
                    </div>
                </div>
            )}
        </div>
    );
} 