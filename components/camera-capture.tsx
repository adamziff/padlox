'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMediaQuery } from '../hooks/use-media-query'
import { Button } from './ui/button'
import { CrossIcon, CameraIcon, VideoIcon, CameraFlipIcon } from './icons'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Regular non-hook export for the functionality we need from react-media-recorder
// This is a simplified version that doesn't use hooks
class MediaRecorderHelper {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: BlobPart[] = [];
    private stream: MediaStream | null = null;

    async setup({ video, audio }: { video: MediaTrackConstraints, audio: boolean }) {
        try {
            // Stop existing stream if one exists
            this.cleanup();

            this.stream = await navigator.mediaDevices.getUserMedia({
                video,
                audio
            });
            return {
                status: 'idle',
                previewStream: this.stream,
                error: null
            };
        } catch (err) {
            console.error('Failed to get media devices', err);
            return {
                status: 'error',
                previewStream: null,
                error: err
            };
        }
    }

    startRecording(onDataAvailable: (data: BlobEvent) => void) {
        if (!this.stream) return false;

        this.chunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);

        this.mediaRecorder.ondataavailable = onDataAvailable;
        this.mediaRecorder.start();

        return true;
    }

    stopRecording() {
        if (!this.mediaRecorder) return false;

        this.mediaRecorder.stop();
        return true;
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.mediaRecorder = null;
        this.chunks = [];
    }

    getStream() {
        return this.stream;
    }
}

export interface CameraCaptureProps {
    onCapture: (file: File) => void
    onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
    const [mode, setMode] = useState<'photo' | 'video'>('photo')
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
    const [countdown, setCountdown] = useState<number | null>(null)
    const [hasFrontCamera, setHasFrontCamera] = useState(false)
    const [recorderStatus, setRecorderStatus] = useState<'idle' | 'recording' | 'stopping' | 'error'>('idle')
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null)
    const [isInitializing, setIsInitializing] = useState(true)

    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const mediaRecorderRef = useRef<MediaRecorderHelper>(new MediaRecorderHelper())
    const chunks = useRef<BlobPart[]>([])

    const { theme } = useTheme()
    const isDarkMode = theme === 'dark'
    const isMobile = useMediaQuery('(max-width: 768px)')

    // Check for camera devices
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

        async function checkCameras() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                setHasFrontCamera(videoDevices.length > 1);
            } catch (err) {
                console.error('Error checking cameras:', err);
            }
        }

        checkCameras();
    }, []);

    // Initialize camera - only when facingMode changes
    const initializeCamera = useCallback(async () => {
        try {
            setIsInitializing(true);

            // Initialize media recorder with both video and audio permissions
            // We'll always request audio permissions but only use them for video mode
            const result = await mediaRecorderRef.current.setup({
                video: { facingMode },
                audio: true
            });

            if (result.previewStream && videoRef.current) {
                videoRef.current.srcObject = result.previewStream;
                streamRef.current = result.previewStream;
            }

            setIsInitializing(false);
        } catch (err) {
            console.error('Error initializing camera', err);
            setIsInitializing(false);
        }
    }, [facingMode]);

    // Initialize camera on mount and facingMode changes
    useEffect(() => {
        initializeCamera();

        const currentMediaRecorderRef = mediaRecorderRef.current;

        return () => {
            // Clean up on unmount
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            currentMediaRecorderRef.cleanup();
        };
    }, [facingMode, initializeCamera]);

    // Handle mode changes separately to avoid reinitializing the camera
    useEffect(() => {
        if (!streamRef.current) return;

        // When mode changes, we don't need to recreate the stream,
        // just enable/disable audio tracks as needed
        const audioTracks = streamRef.current.getAudioTracks();

        audioTracks.forEach(track => {
            track.enabled = mode === 'video';
        });

    }, [mode]);

    // Handle takePhoto
    const takePhoto = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || !streamRef.current) return;

        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Set canvas dimensions to match current video feed
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw current frame to canvas
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Flip horizontal if using front camera
            if (facingMode === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to file
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/jpeg', 0.9)
            );

            if (blob) {
                const file = new File([blob], `photo-${Date.now()}.jpg`, {
                    type: 'image/jpeg'
                });
                onCapture(file);
            }
        } catch (error) {
            console.error('Error taking photo:', error);
        }
    }, [facingMode, onCapture]);

    // Photo countdown handler
    useEffect(() => {
        if (countdown === null) return;

        if (countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else {
            takePhoto();
            setCountdown(null);
        }
    }, [countdown, takePhoto]);

    // Toggle camera facing direction
    const toggleFacingMode = useCallback(() => {
        // When changing facing mode, we need to reinitialize the camera
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
        // Camera reinitialization will happen in the useEffect
    }, []);

    // Setup photo capture with optional timer
    const capturePhoto = useCallback((withTimer = false) => {
        if (withTimer) {
            setCountdown(3);
        } else {
            takePhoto();
        }
    }, [takePhoto]);

    // Start recording
    const startRecording = useCallback(() => {
        setRecorderStatus('recording');
        chunks.current = [];

        const onDataAvailable = (e: BlobEvent) => {
            if (e.data.size > 0) {
                chunks.current.push(e.data);
            }
        };

        mediaRecorderRef.current.startRecording(onDataAvailable);
    }, []);

    // Stop recording
    const stopRecording = useCallback(async () => {
        setRecorderStatus('stopping');

        // Create a promise to wait for the final data
        const recordedBlob = await new Promise<Blob>((resolve) => {
            const mr = mediaRecorderRef.current;

            // Set up a listener for the stop event
            if (mr.getStream()) {
                const onStop = () => {
                    if (chunks.current.length > 0) {
                        const blob = new Blob(chunks.current, { type: 'video/webm' });
                        resolve(blob);
                    }
                };

                mr.stopRecording();

                // We need to manually create the blob since we're not using the full react-media-recorder
                setTimeout(onStop, 500);
            }
        });

        if (recordedBlob) {
            const url = URL.createObjectURL(recordedBlob);
            setMediaBlobUrl(url);

            const file = new File([recordedBlob], `video-${Date.now()}.webm`, {
                type: 'video/webm'
            });

            setRecorderStatus('idle');
            onCapture(file);
        }
    }, [onCapture]);

    // Handle mode switch with proper cleanup
    const handleModeChange = useCallback((newMode: 'photo' | 'video') => {
        if (recorderStatus === 'recording') {
            // If recording, stop it before switching modes
            stopRecording();
        }

        setMode(newMode);
    }, [recorderStatus, stopRecording]);

    // Close and cleanup
    const handleClose = useCallback(() => {
        if (recorderStatus === 'recording') {
            mediaRecorderRef.current.stopRecording();
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }

        mediaRecorderRef.current.cleanup();

        if (mediaBlobUrl) {
            URL.revokeObjectURL(mediaBlobUrl);
        }

        onClose();
    }, [recorderStatus, mediaBlobUrl, onClose]);

    if (isInitializing) {
        return (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-background p-8 rounded-lg flex flex-col items-center gap-4">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p>Initializing camera...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center",
                isMobile && "bg-black"
            )}
            role="dialog"
            aria-label="Camera Capture"
        >
            <div
                className={cn(
                    "bg-background flex flex-col overflow-hidden",
                    isMobile
                        ? "w-full h-full"
                        : "w-full max-w-3xl rounded-lg max-h-[90vh]"
                )}
            >
                {/* Header */}
                <div className={cn(
                    "p-4 flex justify-between items-center",
                    !isMobile && "border-b"
                )}>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        aria-label="Close camera capture"
                        data-testid="close-button"
                        className={cn(
                            "text-foreground",
                            isMobile && "text-white"
                        )}
                    >
                        <CrossIcon />
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'photo' ? 'default' : 'outline'}
                            onClick={() => handleModeChange('photo')}
                            disabled={recorderStatus === 'recording'}
                            className={cn(
                                isMobile && isDarkMode && "bg-gray-800 text-white",
                                isMobile && !isDarkMode && "bg-gray-200 text-black"
                            )}
                        >
                            <div className="mr-2">
                                <CameraIcon />
                            </div>
                            Photo
                        </Button>
                        <Button
                            variant={mode === 'video' ? 'default' : 'outline'}
                            onClick={() => handleModeChange('video')}
                            disabled={recorderStatus === 'recording'}
                            className={cn(
                                isMobile && isDarkMode && "bg-gray-800 text-white",
                                isMobile && !isDarkMode && "bg-gray-200 text-black"
                            )}
                        >
                            <div className="mr-2">
                                <VideoIcon />
                            </div>
                            Video
                        </Button>
                    </div>
                    {hasFrontCamera && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleFacingMode}
                            aria-label="Switch camera"
                            className={cn(
                                "text-foreground",
                                isMobile && "text-white"
                            )}
                        >
                            <CameraFlipIcon />
                        </Button>
                    )}
                </div>

                {/* Camera Preview */}
                <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden">
                    {countdown !== null && (
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="text-white text-8xl font-bold animate-pulse">
                                {countdown}
                            </div>
                        </div>
                    )}

                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={cn(
                            "w-full h-full object-contain",
                            facingMode === 'user' && "transform scale-x-[-1]"
                        )}
                        data-testid="camera-feed"
                    />

                    {/* Hidden canvas for photo capture */}
                    <canvas
                        ref={canvasRef}
                        className="hidden"
                    />
                </div>

                {/* Capture Controls */}
                <div className={cn(
                    "p-6 flex justify-center items-center gap-4",
                    isMobile ? "bg-black" : "bg-background/80 backdrop-blur-sm"
                )}>
                    {mode === 'photo' ? (
                        <>
                            {/* Photo capture button */}
                            <Button
                                size="lg"
                                className="rounded-full w-16 h-16 p-0 relative hover:bg-primary/90 transition-colors"
                                onClick={() => capturePhoto(false)}
                                data-testid="capture-button"
                            >
                                <div className="absolute inset-2 rounded-full border-4 border-white bg-transparent" />
                                <div className="absolute inset-4 rounded-full bg-white" />
                            </Button>

                            {/* Timer button for photos (mobile only) */}
                            {isMobile && (
                                <Button
                                    variant="ghost"
                                    className="text-white"
                                    onClick={() => capturePhoto(true)}
                                >
                                    3s
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Video recording button */}
                            <Button
                                size="lg"
                                className="rounded-full w-16 h-16 p-0 relative hover:bg-primary/90 transition-colors"
                                onClick={recorderStatus === 'recording' ? stopRecording : startRecording}
                                variant={recorderStatus === 'recording' ? 'destructive' : 'default'}
                                data-testid="capture-button"
                            >
                                {recorderStatus === 'recording' ? (
                                    <div className="w-8 h-8 rounded-sm bg-destructive" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-destructive animate-pulse" />
                                )}
                            </Button>

                            {/* Recording status indicator */}
                            {recorderStatus === 'recording' && (
                                <div className="text-destructive animate-pulse">
                                    REC
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
