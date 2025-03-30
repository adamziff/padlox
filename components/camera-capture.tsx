'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMediaQuery } from '../hooks/use-media-query'
import { Button } from './ui/button'
import { CrossIcon, CameraIcon, VideoIcon, CameraFlipIcon, UploadIcon } from './icons'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Refined MediaRecorder helper class with improved cleanup
class MediaRecorderHelper {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: BlobPart[] = [];
    private stream: MediaStream | null = null;
    private trackCleanupPromises: Promise<void>[] = [];

    async setup({ video, audio }: { video: MediaTrackConstraints, audio: boolean }) {
        try {
            // Stop existing stream if one exists - ensure this is completed before continuing
            await this.cleanup();

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

    // Improved cleanup with track-specific stops and removal of all references
    async cleanup(): Promise<void> {
        try {
            // Stop the media recorder if active
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                try {
                    this.mediaRecorder.stop();
                } catch (e) {
                    // Ignore any errors when stopping the recorder
                    console.log('Ignored media recorder stop error:', e);
                }
            }
            this.mediaRecorder = null;

            // Stop all tracks individually with promises
            if (this.stream) {
                const tracks = this.stream.getTracks();

                // Create promises for each track stop to ensure they're all completed
                this.trackCleanupPromises = tracks.map(track =>
                    new Promise<void>(resolve => {
                        try {
                            track.stop();
                            // Some browsers need time to fully release camera resources
                            setTimeout(resolve, 50);
                        } catch (e) {
                            // Ensure we always resolve even if there's an error
                            console.log('Ignored track stop error:', e);
                            resolve();
                        }
                    })
                );

                // Wait for all tracks to be stopped
                await Promise.all(this.trackCleanupPromises);

                // Set stream to null after stopping all tracks
                this.stream = null;
            }

            this.chunks = [];
            this.trackCleanupPromises = [];
        } catch (error) {
            console.error('Error during camera cleanup:', error);
        }
    }

    // Force immediate cleanup without waiting
    immediateCleanup() {
        if (this.stream) {
            try {
                this.stream.getTracks().forEach(track => {
                    track.stop();
                });
                this.stream = null;
            } catch (e) {
                // Ignore errors
                console.log('Ignored immediate stop error:', e);
            }
        }

        if (this.mediaRecorder) {
            try {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
            } catch (e) {
                // Ignore errors
                console.log('Ignored immediate stop error:', e);
            }
            this.mediaRecorder = null;
        }

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
    const [isInitializing, setIsInitializing] = useState(true)
    const [isCleaning, setIsCleaning] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const mediaRecorderRef = useRef<MediaRecorderHelper>(new MediaRecorderHelper())
    const chunks = useRef<BlobPart[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Track if component is mounted to prevent state updates after unmounting
    const isMountedRef = useRef(true)

    const { resolvedTheme } = useTheme()
    const isDarkMode = resolvedTheme === 'dark'
    const isMobile = useMediaQuery('(max-width: 768px)')

    // Thorough cleanup function to be called in all exit paths
    const performFullCleanup = useCallback(async () => {
        try {
            setIsCleaning(true);

            // First, perform immediate cleanup to release camera as fast as possible
            mediaRecorderRef.current.immediateCleanup();

            // Clear video element's srcObject
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
            }

            // Reset stream reference
            streamRef.current = null;

            // Now do the more thorough async cleanup
            await mediaRecorderRef.current.cleanup();

            // Manually trigger garbage collection by nullifying references
            if (isMountedRef.current) {
                setIsCleaning(false);
            }
        } catch (error) {
            console.error('Error during full cleanup:', error);
            if (isMountedRef.current) {
                setIsCleaning(false);
            }
        }
    }, []);
    // Ensure full cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
            performFullCleanup();
        };
    }, [performFullCleanup]);

    // Check for camera devices
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

        const checkCameras = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                if (isMountedRef.current) {
                    setHasFrontCamera(videoDevices.length > 1);
                }
            } catch (err) {
                console.error('Error checking cameras:', err);
            }
        };

        checkCameras();
    }, []);

    // Initialize camera - only when facingMode changes
    const initializeCamera = useCallback(async () => {
        try {
            setIsInitializing(true);

            // Make sure any previous stream is fully cleaned up before initializing new one
            await mediaRecorderRef.current.cleanup();

            // Initialize media recorder with both video and audio permissions
            const result = await mediaRecorderRef.current.setup({
                video: { facingMode },
                audio: true
            });

            if (result.previewStream && videoRef.current) {
                videoRef.current.srcObject = result.previewStream;
                videoRef.current?.play().catch(console.error);
                streamRef.current = result.previewStream;

                // More robust video play attempt with retries
                const attemptPlay = async (retries = 3, delay = 300) => {
                    try {
                        await videoRef.current?.play();
                        console.log('Video playback started successfully');
                    } catch (err) {
                        console.warn(`Play attempt failed (${retries} retries left):`, err);
                        if (retries > 0 && videoRef.current) {
                            // Retry after a short delay
                            setTimeout(() => attemptPlay(retries - 1, delay), delay);
                        }
                    }
                };

                // Start first attempt
                attemptPlay();
            }

            if (isMountedRef.current) {
                setIsInitializing(false);
            }
        } catch (err) {
            console.error('Error initializing camera', err);
            if (isMountedRef.current) {
                setIsInitializing(false);
            }
        }
    }, [facingMode]);

    // Initialize camera on mount and facingMode changes
    useEffect(() => {
        initializeCamera();
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

                // Start cleanup immediately after capturing the photo
                performFullCleanup();

                // Trigger the onCapture callback
                onCapture(file);
            }
        } catch (error) {
            console.error('Error taking photo:', error);
        }
    }, [facingMode, onCapture, performFullCleanup]);

    // Photo countdown handler
    useEffect(() => {
        if (countdown === null) return;

        if (countdown > 0) {
            const timer = setTimeout(() => {
                if (isMountedRef.current) {
                    setCountdown(countdown - 1);
                }
            }, 1000);
            return () => clearTimeout(timer);
        } else {
            takePhoto();
            if (isMountedRef.current) {
                setCountdown(null);
            }
        }
    }, [countdown, takePhoto]);

    // Toggle camera facing direction
    const toggleFacingMode = useCallback(() => {
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
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

                // Create the blob after a short delay to ensure all data is collected
                setTimeout(onStop, 500);
            }
        });

        if (recordedBlob) {
            const file = new File([recordedBlob], `video-${Date.now()}.webm`, {
                type: 'video/webm'
            });

            if (isMountedRef.current) {
                setRecorderStatus('idle');
            }

            // Start cleanup before calling onCapture to release camera resources faster
            performFullCleanup();

            onCapture(file);
        }
    }, [onCapture, performFullCleanup]);

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

        // Perform thorough cleanup before calling onClose
        performFullCleanup();

        onClose();
    }, [recorderStatus, onClose, performFullCleanup]);

    // Additional effect to ensure video plays after user interaction
    useEffect(() => {
        if (videoRef.current && videoRef.current.srcObject && !isInitializing) {
            const playVideo = async () => {
                try {
                    await videoRef.current?.play();
                    console.log('Video playback started via useEffect');
                } catch (playError) {
                    console.warn('Could not autoplay video in effect:', playError);
                }
            };

            // Try to play immediately 
            playVideo();

            // Also try after a short delay (helps with certain browsers)
            const delayedPlayTimer = setTimeout(playVideo, 500);

            return () => clearTimeout(delayedPlayTimer);
        }
    }, [videoRef.current?.srcObject, isInitializing]);

    // Handle file upload
    const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        // Make sure it's a video
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file.');
            return;
        }

        try {
            setIsUploading(true);

            // Create a copy of the file with a normalized name
            const videoFile = new File(
                [file],
                `video-${Date.now()}.${file.name.split('.').pop()}`,
                { type: file.type }
            );

            // Start cleanup before calling onCapture
            await performFullCleanup();

            // Reset the file input for future uploads
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

            // Send the file through the same flow as camera-captured videos
            onCapture(videoFile);
        } catch (error) {
            console.error('Error processing uploaded video:', error);
        } finally {
            setIsUploading(false);
        }
    }, [onCapture, performFullCleanup]);

    // Trigger file input click
    const triggerFileUpload = useCallback(() => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, []);

    // Loading state
    if (isInitializing || isCleaning || isUploading) {
        return (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-background p-8 rounded-lg flex flex-col items-center gap-4">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p>
                        {isInitializing
                            ? "Initializing camera..."
                            : isUploading
                                ? "Processing video..."
                                : "Releasing camera..."}
                    </p>
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
            {/* Hidden file input for video uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileUpload}
                aria-label="Upload video"
            />

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
                            isMobile && isDarkMode && "text-white"
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
                            <CameraIcon className="mr-2" />
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
                            <VideoIcon className="mr-2" />
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
                                isMobile && isDarkMode && "text-white"
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

                            {/* Timer button for photos */}
                            <Button
                                variant={isMobile ? "ghost" : "outline"}
                                className={isMobile ? "text-white" : ""}
                                onClick={() => capturePhoto(true)}
                            >
                                3s
                            </Button>
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

                            {/* Video upload button - only shown when not recording */}
                            {recorderStatus !== 'recording' && (
                                <Button
                                    variant={isMobile ? "ghost" : "outline"}
                                    className={cn(
                                        "flex items-center gap-2 ml-2",
                                        isMobile && isDarkMode && "text-white"
                                    )}
                                    onClick={triggerFileUpload}
                                    aria-label="Upload video"
                                >
                                    <UploadIcon size={18} />
                                    <span>{isMobile ? "" : "Upload"}</span>
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}