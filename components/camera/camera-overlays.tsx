import React from 'react';
import { Button } from '@/components/ui/button';

interface CameraOverlaysProps {
    isInitializing: boolean;
    isCleaning: boolean;
    isUploading: boolean;
    recorderStatus: 'idle' | 'recording' | 'stopping' | 'error';
    errorMessage: string | null;
    onRetryInit: () => void; // Callback to retry initialization
}

export function CameraOverlays({ // Renamed to CameraOverlays
    isInitializing,
    isCleaning,
    isUploading,
    recorderStatus,
    errorMessage,
    onRetryInit,
}: CameraOverlaysProps) {
    const showInitializationSpinner = isInitializing && recorderStatus !== 'error';
    const showProcessingSpinner = isCleaning || isUploading;
    const showErrorOverlay = recorderStatus === 'error' && errorMessage; // Show only if there's an error message

    // Determine if the error is retryable (not blocked permissions or unsupported format)
    const isRetryableError = errorMessage && !(errorMessage.includes("permission") || errorMessage.includes("blocked") || errorMessage.includes("supported") || errorMessage.includes("found"));

    return (
        <>
            {/* Initialization Spinner */}
            {showInitializationSpinner && (
                <div className="absolute inset-0 z-40 bg-background/90 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4 p-6 bg-background rounded-lg shadow-xl text-center">
                        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-muted-foreground">Initializing camera...</p>
                    </div>
                </div>
            )}

            {/* Processing (Cleaning/Uploading) Spinner */}
            {showProcessingSpinner && !showInitializationSpinner && ( // Don't show if init spinner is already showing
                <div className="absolute inset-0 z-40 bg-background/90 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4 p-6 bg-background rounded-lg shadow-xl text-center">
                        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-muted-foreground">
                            {isUploading
                                ? "Processing uploaded video..."
                                : isCleaning
                                    ? "Releasing camera..."
                                    : "Processing..."} { /* Generic fallback */}
                        </p>
                    </div>
                </div>
            )}

            {/* Error Overlay */}
            {showErrorOverlay && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 p-6 text-center backdrop-blur-sm">
                    <div className="bg-background p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <p className="text-destructive text-lg font-semibold mb-3">Camera Issue</p>
                        <p className="text-muted-foreground text-sm mb-4">{errorMessage}</p>
                        {isRetryableError && (
                            <Button variant="outline" size="sm" onClick={onRetryInit} disabled={isInitializing}>
                                {isInitializing ? "Retrying..." : "Try Again"}
                            </Button>
                        )}
                        {errorMessage && errorMessage.includes("permission") && (
                            <p className="text-xs text-muted-foreground mt-3">Check browser site settings to grant access, then try again or refresh the page.</p>
                        )}
                        {errorMessage && errorMessage.includes("supported") && (
                            <p className="text-xs text-muted-foreground mt-3">Your browser may not support the required video recording features.</p>
                        )}
                        {errorMessage && errorMessage.includes("found") && (
                            <p className="text-xs text-muted-foreground mt-3">Ensure a camera is connected and not in use by another app.</p>
                        )}
                    </div>
                </div>
            )}
        </>
    );
} 