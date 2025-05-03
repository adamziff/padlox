'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Import the hook
import { useCameraCore } from '@/hooks/use-camera-core';

// Import sub-components
import { CameraHeader } from './camera/camera-header';
import { CameraView } from './camera/camera-view';
import { CameraControls } from './camera/camera-controls';
import { CameraOverlays } from './camera/camera-overlays';

// Keep the component props interface
export interface CameraCaptureProps {
    onCapture: (file: File) => void
    onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
    // --- State managed by the UI component --- 
    const [mode, setMode] = useState<'photo' | 'video'>('video')
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
    const [countdown, setCountdown] = useState<number | null>(null)
    const [isUploading, setIsUploading] = useState(false) // Keep upload state here

    // --- Refs for DOM elements needed by the UI component --- 
    const videoRef = useRef<HTMLVideoElement>(null) // Stays as RefObject<HTMLVideoElement | null>
    const canvasRef = useRef<HTMLCanvasElement>(null) // Stays as RefObject<HTMLCanvasElement | null>
    const fileInputRef = useRef<HTMLInputElement>(null)

    // --- Hooks --- 
    const { resolvedTheme } = useTheme()
    const isDarkMode = resolvedTheme === 'dark'
    const isMobile = useMediaQuery('(max-width: 768px)')

    // --- Core Camera Logic Hook --- 
    const {
        recorderStatus,
        isInitializing,
        isCleaning,
        errorMessage,
        hasFrontCamera,
        takePhoto,
        startRecording,
        stopRecording,
        initializeCamera,
    } = useCameraCore({
        facingMode,
        videoRef,
        canvasRef,
        onCaptureSuccess: (file) => {
            // Photo capture: forward file to parent
            console.log("CameraCapture: photo captured, invoking onCapture");
            onCapture(file);
        },
        streamingUpload: mode === 'video',
        onStreamComplete: () => {
            // Video streaming complete: simply close
            console.log("CameraCapture: video stream complete, closing capture UI");
            onClose();
        }
    });

    // --- UI Event Handlers --- 

    // Handle mode switch
    const handleModeChange = useCallback((newMode: 'photo' | 'video') => {
        if (recorderStatus === 'recording') {
            console.warn("Attempted to change mode while recording. Stopping recording first.");
            stopRecording(); // Stop recording before switching modes
        }
        setMode(newMode);
        setCountdown(null); // Reset countdown when switching modes
    }, [recorderStatus, stopRecording]); // Dependency on hook state/functions

    // Close and trigger cleanup (via hook's unmount)
    const handleClose = useCallback(() => {
        console.log("CameraCapture: handleClose called");
        // The hook's useEffect cleanup handles stopping streams/recorder
        onClose(); // Simply call the parent's close handler
    }, [onClose]);

    // Toggle camera facing direction
    const toggleFacingMode = useCallback(() => {
        setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
        // The useCameraCore hook useEffect will trigger re-initialization
        setCountdown(null); // Reset countdown on flip
    }, []);

    // Setup photo capture (with optional timer)
    const capturePhoto = useCallback((withTimer = false) => {
        if (withTimer) {
            setCountdown(3);
        } else {
            if (recorderStatus === 'idle' || recorderStatus === 'error') { // Only take photo if not recording/stopping
                takePhoto(); // Call the function from the hook
            }
        }
    }, [takePhoto, recorderStatus]); // Dependency on hook function and status

    // Start/Stop video recording
    const handleVideoCapture = useCallback(() => {
        if (recorderStatus === 'recording') {
            stopRecording();
        } else if (recorderStatus === 'idle') {
            startRecording();
        }
    }, [recorderStatus, startRecording, stopRecording]); // Dependencies on hook state/functions

    // Handle file upload initiated by the user
    const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file.');
            return;
        }

        setIsUploading(true); // Set uploading state
        try {
            // Create a copy with a standardized name
            const extension = file.name.split('.').pop() || 'mp4';
            const videoFile = new File([file], `video-upload-${Date.now()}.${extension}`, { type: file.type });

            // No need to call cleanup here, as selecting a file implies abandoning the camera stream
            // The onClose or a subsequent capture would trigger cleanup via the hook

            if (fileInputRef.current) {
                fileInputRef.current.value = ''; // Reset file input
            }

            onCapture(videoFile); // Call parent onCapture
        } catch (error) {
            console.error('Error processing uploaded video:', error);
            // Maybe set an error message state here if needed
        } finally {
            setIsUploading(false); // Reset uploading state
        }
    }, [onCapture]); // Dependency on parent callback

    // Trigger file input click
    const triggerFileUpload = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Photo countdown handler
    useEffect(() => {
        if (countdown === null) return;

        if (countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else {
            // When countdown reaches 0, take the photo
            if (recorderStatus === 'idle' || recorderStatus === 'error') {
                takePhoto();
            }
            setCountdown(null); // Reset countdown
        }
    }, [countdown, takePhoto, recorderStatus]); // Dependencies

    // --- Render --- 
    return (
        <div
            className={cn(
                "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center",
                isMobile && "bg-black" // Full black background on mobile
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Camera Capture"
        >
            {/* Hidden file input for video uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept="video/*" // Only accept video files
                className="hidden"
                onChange={handleFileUpload}
                aria-label="Upload video file"
            />

            <div
                className={cn(
                    "bg-background flex flex-col overflow-hidden relative",
                    isMobile
                        ? "w-full h-full"
                        : "w-full max-w-3xl rounded-lg max-h-[90vh] shadow-2xl" // Desktop view with constraints
                )}
            >
                <CameraOverlays
                    isInitializing={isInitializing}
                    isCleaning={isCleaning}
                    isUploading={isUploading}
                    recorderStatus={recorderStatus}
                    errorMessage={errorMessage}
                    onRetryInit={initializeCamera} // Pass retry function from hook
                />

                <CameraHeader
                    mode={mode}
                    hasFrontCamera={hasFrontCamera}
                    isRecording={recorderStatus === 'recording'}
                    isMobile={isMobile}
                    isDarkMode={isDarkMode}
                    onClose={handleClose}
                    onModeChange={handleModeChange}
                    onToggleFacingMode={toggleFacingMode}
                />

                <CameraView
                    videoRef={videoRef} // Pass the ref directly (now compatible type)
                    canvasRef={canvasRef} // Pass the ref directly (now compatible type)
                    facingMode={facingMode}
                    mode={mode}
                    recorderStatus={recorderStatus}
                    countdown={countdown}
                    errorMessage={errorMessage}
                />

                <CameraControls
                    mode={mode}
                    recorderStatus={recorderStatus}
                    isMobile={isMobile}
                    isDarkMode={isDarkMode}
                    isInitializing={isInitializing}
                    isUploading={isUploading}
                    errorMessage={errorMessage}
                    onCapturePhoto={capturePhoto}
                    onVideoCapture={handleVideoCapture}
                    onTriggerFileUpload={triggerFileUpload}
                />
            </div>
        </div>
    )
}