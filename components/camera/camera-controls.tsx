import React from 'react';
import { Button } from '@/components/ui/button';
import { UploadIcon } from '@/components/icons'; // Assuming icons are in this path
import { cn } from '@/lib/utils';

interface CameraControlsProps {
    mode: 'photo' | 'video';
    recorderStatus: 'idle' | 'recording' | 'stopping' | 'error';
    isMobile: boolean;
    isDarkMode: boolean;
    isInitializing: boolean;
    isUploading: boolean;
    errorMessage: string | null;
    onCapturePhoto: (withTimer: boolean) => void;
    onVideoCapture: () => void;
    onTriggerFileUpload: () => void;
}

export function CameraControls({ // Renamed to CameraControls
    mode,
    recorderStatus,
    isMobile,
    isDarkMode,
    isInitializing,
    isUploading,
    errorMessage,
    onCapturePhoto,
    onVideoCapture,
    onTriggerFileUpload,
}: CameraControlsProps) {
    const captureDisabled = isInitializing || recorderStatus === 'stopping' || (recorderStatus === 'error' && !!errorMessage) || isUploading;
    const showUploadButton = (recorderStatus === 'idle' || recorderStatus === 'error') && !isInitializing && process.env.NODE_ENV === 'development';

    return (
        <div className={cn(
            "p-4 sm:p-6 flex justify-center items-center gap-4 shrink-0", // Added shrink-0
            isMobile ? "bg-black" : "bg-background/80 backdrop-blur-sm border-t" // Added border-t for desktop
        )}>
            {mode === 'photo' ? (
                <>
                    {/* Main Photo Capture Button */}
                    <Button
                        size="lg"
                        className={cn(
                            "rounded-full w-16 h-16 p-0 relative transition-colors",
                            "bg-white hover:bg-neutral-200 border-4 border-neutral-300 dark:border-neutral-600 dark:bg-neutral-100 dark:hover:bg-neutral-300 shadow-md",
                            captureDisabled && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => onCapturePhoto(false)}
                        data-testid="capture-button-photo"
                        disabled={captureDisabled}
                        aria-label="Take Photo"
                    >
                        {/* Inner circle for photo button appearance */}
                        {/* <div className="absolute inset-1 rounded-full bg-white" /> */}
                    </Button>
                    {/* Timer Button */}
                    <Button
                        variant={isMobile ? "ghost" : "outline"}
                        className={cn(
                            isMobile ? "text-white" : "",
                            "w-16 h-16 rounded-full flex items-center justify-center text-lg font-medium",
                            captureDisabled && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={() => onCapturePhoto(true)}
                        disabled={captureDisabled}
                        aria-label="Take Photo with 3 second timer"
                    >
                        3s
                    </Button>
                </>
            ) : ( // Video Mode Controls
                <>
                    {/* Record/Stop Button */}
                    <Button
                        size="lg"
                        className={cn(
                            "rounded-full w-16 h-16 p-0 relative transition-all duration-200 ease-in-out flex items-center justify-center shadow-md",
                            recorderStatus === 'recording' ?
                                "bg-red-500 hover:bg-red-600 border-4 border-red-700" :
                                "bg-white hover:bg-neutral-200 border-4 border-neutral-300 dark:border-neutral-600 dark:bg-neutral-100 dark:hover:bg-neutral-300",
                            captureDisabled && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={onVideoCapture}
                        data-testid="capture-button-video"
                        disabled={captureDisabled}
                        aria-label={recorderStatus === 'recording' ? "Stop Recording" : "Start Recording"}
                    >
                        {recorderStatus === 'recording' ? (
                            // White square for stop
                            <div className="w-5 h-5 bg-white rounded-sm" />
                        ) : recorderStatus === 'stopping' ? (
                            // Spinner while stopping
                            <div className="h-6 w-6 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            // Red circle for record start
                            <div className="w-8 h-8 rounded-full bg-red-500" />
                        )}
                    </Button>

                    {/* REC indicator & Upload Button Container */}
                    <div className={cn(
                        "absolute left-4 bottom-4 sm:static flex items-center h-16",
                        isMobile && "justify-end w-16" // Position upload on mobile
                    )}>
                        {recorderStatus === 'recording' && (
                            <div className={cn(
                                "text-red-500 animate-pulse font-semibold text-xs px-2 py-1 rounded bg-black/50",
                                !isMobile && "ml-4" // Add margin on desktop
                            )}>
                                REC
                            </div>
                        )}
                        {showUploadButton && (
                            <Button
                                variant={isMobile ? "ghost" : "outline"}
                                size="icon" // Make it an icon button
                                className={cn(
                                    "ml-2", // Consistent margin
                                    isMobile && isDarkMode && "text-white hover:bg-gray-700",
                                    isMobile && !isDarkMode && "text-black hover:bg-gray-300",
                                    !isMobile && "w-16 h-16 rounded-full", // Match size on desktop
                                    (isUploading || isInitializing) && "opacity-50 cursor-not-allowed"
                                )}
                                onClick={onTriggerFileUpload}
                                aria-label="Upload video"
                                disabled={isUploading || isInitializing} // Also disable while initializing
                            >
                                <UploadIcon size={isMobile ? 20 : 24} /> {/* Adjust icon size */}
                            </Button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
} 