import React from 'react';
import { Button } from '@/components/ui/button';
import { CrossIcon, CameraIcon, VideoIcon, CameraFlipIcon } from '@/components/icons'; // Assuming icons are in this path
import { cn } from '@/lib/utils';

interface CameraHeaderProps {
    mode: 'photo' | 'video';
    hasFrontCamera: boolean;
    isRecording: boolean;
    isMobile: boolean;
    isDarkMode: boolean;
    onClose: () => void;
    onModeChange: (mode: 'photo' | 'video') => void;
    onToggleFacingMode: () => void;
}

export function CameraHeader({ // Renamed to CameraHeader for clarity
    mode,
    hasFrontCamera,
    isRecording,
    isMobile,
    isDarkMode,
    onClose,
    onModeChange,
    onToggleFacingMode,
}: CameraHeaderProps) {
    return (
        <div className={cn(
            "p-4 flex justify-between items-center shrink-0", // Added shrink-0 to prevent growing
            !isMobile && "border-b" // Add border on non-mobile
        )}>
            {/* Close Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close camera capture"
                data-testid="close-button"
                className={cn(
                    "text-foreground", // Standard text color
                    isMobile && isDarkMode && "text-white", // Specific color for mobile dark mode
                    "w-10 h-10" // Explicit size
                )}
            >
                <CrossIcon />
            </Button>

            {/* Mode Toggle Buttons */}
            <div className="flex gap-2">
                <Button
                    variant={mode === 'video' ? 'default' : 'outline'}
                    onClick={() => onModeChange('video')}
                    disabled={isRecording} // Disable mode change while recording
                    size={isMobile ? 'sm' : 'default'} // Smaller buttons on mobile
                    className={cn(
                        "min-w-[80px]", // Minimum width for consistency
                        isMobile && isDarkMode && "bg-gray-800 text-white border-gray-700 hover:bg-gray-700",
                        isMobile && !isDarkMode && "bg-gray-200 text-black border-gray-300 hover:bg-gray-300"
                    )}
                >
                    <VideoIcon className="mr-1.5 h-4 w-4" />
                    Video
                </Button>
                <Button
                    variant={mode === 'photo' ? 'default' : 'outline'}
                    onClick={() => onModeChange('photo')}
                    disabled={isRecording}
                    size={isMobile ? 'sm' : 'default'}
                    className={cn(
                        "min-w-[80px]",
                        isMobile && isDarkMode && "bg-gray-800 text-white border-gray-700 hover:bg-gray-700",
                        isMobile && !isDarkMode && "bg-gray-200 text-black border-gray-300 hover:bg-gray-300"
                    )}
                >
                    <CameraIcon className="mr-1.5 h-4 w-4" />
                    Photo
                </Button>
            </div>

            {/* Camera Flip Button (conditional) */}
            <div className="w-10 h-10 flex items-center justify-center"> {/* Wrapper to maintain layout */}
                {hasFrontCamera && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleFacingMode}
                        aria-label="Switch camera"
                        disabled={isRecording} // Optionally disable flip while recording
                        className={cn(
                            "text-foreground",
                            isMobile && isDarkMode && "text-white"
                        )}
                    >
                        <CameraFlipIcon />
                    </Button>
                )}
            </div>
        </div>
    );
} 