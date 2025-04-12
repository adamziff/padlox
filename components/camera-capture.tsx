'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMediaQuery } from '../hooks/use-media-query'
import { Button } from './ui/button'
import { CrossIcon, CameraIcon, VideoIcon, CameraFlipIcon, UploadIcon } from './icons'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Type guard for DOMException
function isDOMException(error: unknown, name?: string): error is DOMException {
    return typeof error === 'object' && error !== null && 'name' in error && (name === undefined || (error as DOMException).name === name);
}

// Refined MediaRecorder helper class with improved cleanup
class MediaRecorderHelper {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: BlobPart[] = [];
    private stream: MediaStream | null = null;
    private trackCleanupPromises: Promise<void>[] = [];

    async setup({ video, audio }: { video: MediaTrackConstraints, audio: boolean }) {
        try {
            await this.cleanup();

            this.stream = await navigator.mediaDevices.getUserMedia({
                video,
                audio
            });
            return {
                status: 'idle',
                previewStream: this.stream,
                error: null // Explicitly null on success
            };
        } catch (err) {
            // Log the actual error from getUserMedia
            console.error('Failed to get media devices:', err);
            let errorMessage = 'Failed to access camera or microphone.';

            // Provide more specific error messages based on the DOMException name
            if (isDOMException(err)) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = 'Camera/Microphone permission denied. Please grant access in browser settings and refresh.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    errorMessage = 'No camera/microphone found, or the selected camera is unavailable.';
                } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    errorMessage = 'Camera/Microphone might be in use by another application or hardware error occurred.';
                } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
                    errorMessage = 'The selected camera settings (e.g., resolution) are not supported by your device.';
                } else {
                    errorMessage = `Error accessing media devices: ${err.message} (${err.name})`;
                }
            } else if (err instanceof Error) {
                errorMessage = `Error accessing media devices: ${err.message}`;
            }

            return {
                status: 'error',
                previewStream: null,
                // Return the detailed error message
                error: errorMessage
            };
        }
    }

    startRecording(onDataAvailable: (data: BlobEvent) => void, mimeType?: string) {
        if (!this.stream) return false;

        this.chunks = [];
        try {
            // Attempt to use the specified mimeType if provided and supported
            if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
                this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
                console.log(`Using specified mimeType: ${mimeType}`);
            } else {
                // Fallback to default or previously used type
                this.mediaRecorder = new MediaRecorder(this.stream);
                if (mimeType) {
                    console.warn(`Specified mimeType "${mimeType}" not supported. Falling back to default.`);
                } else {
                    console.log('Using default mimeType.');
                }
            }
        } catch (e) {
            console.error('Error creating MediaRecorder:', e);
            // Fallback to default if constructor with options fails
            this.mediaRecorder = new MediaRecorder(this.stream);
            console.log('Fell back to default MediaRecorder due to error.');
        }

        this.mediaRecorder.ondataavailable = onDataAvailable;
        this.mediaRecorder.start();

        return true;
    }

    stopRecording() {
        if (!this.mediaRecorder) return false;

        // Note: Actual blob creation now happens in CameraCapture component's stopRecording
        // This method just stops the recorder instance.
        if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
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

    // Add a method to get the recorder instance for checking mimeType later
    getRecorderInstance(): MediaRecorder | null {
        return this.mediaRecorder;
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
    // Add state for error messages
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const mediaRecorderRef = useRef<MediaRecorderHelper>(new MediaRecorderHelper())
    const chunks = useRef<BlobPart[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    // Track if initialization is already running
    const isInitializingRef = useRef(false);

    // Track if component is mounted to prevent state updates after unmounting
    const isMountedRef = useRef(true)

    const { resolvedTheme } = useTheme()
    const isDarkMode = resolvedTheme === 'dark'
    const isMobile = useMediaQuery('(max-width: 768px)')

    // Define preferred and fallback MIME types
    const preferredMimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'; // H.264 + AAC in MP4
    const simplerMp4MimeType = 'video/mp4'; // Simpler MP4 type as another option
    const fallbackMimeType = 'video/webm'; // Keep webm as fallback
    const [actualMimeType, setActualMimeType] = useState<string>(fallbackMimeType);

    // Thorough cleanup function (memoized)
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

    // Initialize camera function (memoized)
    const initializeCamera = useCallback(async () => {
        // Prevent multiple simultaneous initializations
        if (isInitializingRef.current) {
            console.log("initializeCamera: Already initializing, skipping.");
            return;
        }
        isInitializingRef.current = true;

        console.log("initializeCamera START"); // Log start
        setIsInitializing(true);
        setErrorMessage(null);
        setRecorderStatus('idle');

        // 1. Permissions Check (Keep this)
        let permissionsOk = true;
        let permErrorMessage: string | null = null;
        if (navigator.permissions?.query) {
            try {
                const cameraPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
                const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });

                if (cameraPerm.state === 'denied' || micPerm.state === 'denied') {
                    permissionsOk = false;
                    permErrorMessage = 'Camera or Microphone permission is blocked. Please enable it in your browser settings and refresh the page.';
                }
                console.log(`Permission states: Camera=${cameraPerm.state}, Microphone=${micPerm.state}`);
            } catch (permError) {
                console.warn("Permissions API query failed:", permError);
            }
        }

        console.log(`Permissions check result: ok=${permissionsOk}, msg=${permErrorMessage}`);

        if (!permissionsOk) {
            console.log("Permissions check failed, exiting initializeCamera.");
            setErrorMessage(permErrorMessage);
            setRecorderStatus('error');
            setIsInitializing(false); // Set init false here too
            return;
        }

        // 2. Proceed with getUserMedia via setup
        try {
            console.log("initializeCamera: Calling cleanup before setup...");
            await mediaRecorderRef.current.cleanup();

            console.log("initializeCamera: Calling setup...");
            const result = await mediaRecorderRef.current.setup({
                video: { facingMode },
                audio: true
            });
            console.log(`initializeCamera: Setup finished. Error: ${result.error}, Stream: ${!!result.previewStream}`);

            // Check the error status returned from setup FIRST.
            if (result.error) {
                console.error("initializeCamera: Setup failed with error:", result.error);
                setErrorMessage(result.error);
                setRecorderStatus('error');
            } else if (result.previewStream && videoRef.current) {
                console.log("initializeCamera: Setup successful, stream exists. Assigning to video element...");
                streamRef.current = result.previewStream;
                videoRef.current.srcObject = result.previewStream;

                // Try to play the video
                try {
                    console.log("initializeCamera: Attempting to play video via onloadedmetadata promise...");
                    await new Promise<void>((resolve, reject) => {
                        if (!videoRef.current) {
                            reject(new Error("Video ref became null"));
                            return;
                        }
                        videoRef.current.onloadedmetadata = () => {
                            console.log("initializeCamera: onloadedmetadata fired.");
                            videoRef.current?.play()
                                .then(() => {
                                    console.log("initializeCamera: Play successful.");
                                    resolve();
                                })
                                .catch(playError => {
                                    console.error("initializeCamera: Play failed (catch inside promise):", playError);
                                    reject(playError);
                                });
                        };
                        setTimeout(() => {
                            console.warn("initializeCamera: Timeout waiting for loadedmetadata.");
                            reject(new Error("Timeout waiting for loadedmetadata"))
                        }, 5000);
                    });

                    console.log("initializeCamera: Play promise resolved. Clearing errors, checking MIME types...");
                    setErrorMessage(null);
                    // Now check supported MIME types *after* successful stream assignment/play
                    if (MediaRecorder.isTypeSupported(preferredMimeType)) {
                        setActualMimeType(preferredMimeType);
                    } else if (MediaRecorder.isTypeSupported(simplerMp4MimeType)) {
                        setActualMimeType(simplerMp4MimeType);
                    } else if (MediaRecorder.isTypeSupported(fallbackMimeType)) {
                        setActualMimeType(fallbackMimeType);
                    } else {
                        console.error("No supported MIME types for recording.");
                        setErrorMessage("Video recording is not supported by your browser/device.");
                    }
                } catch (playError) {
                    console.error("initializeCamera: CATCH block for playError executing:", playError);
                    setErrorMessage("Could not start camera preview. Please try again or check device.");
                    setRecorderStatus('error');
                    console.log("initializeCamera: Calling cleanup due to playError...");
                    if (videoRef.current) videoRef.current.srcObject = null;
                    streamRef.current = null;
                    await mediaRecorderRef.current.cleanup();
                }
            } else {
                console.error("initializeCamera: Setup seemed to succeed but stream is missing or videoRef invalid.");
                setErrorMessage("Failed to initialize camera stream components.");
                setRecorderStatus('error');
            }
            console.log("initializeCamera: TRY block finished successfully (before finally).");
        } catch (err) {
            console.error('initializeCamera: CATCH block for outer setup/initialization error executing:', err);
            setErrorMessage('An unexpected error occurred during camera setup.');
            setRecorderStatus('error');
        } finally {
            console.log(`initializeCamera: FINALLY block executing. Current state: isInitializing=${isInitializing}, recorderStatus=${recorderStatus}, errorMessage=${errorMessage}`);
            console.log(`initializeCamera: FINALLY block. isMountedRef.current: ${isMountedRef.current}`);
            if (isMountedRef.current) {
                console.log("initializeCamera: FINALLY calling setIsInitializing(false).");
                setIsInitializing(false);
            } else {
                console.log("initializeCamera: FINALLY component unmounted, NOT setting isInitializing.");
            }
        }
        console.log("initializeCamera END"); // Log the very end
        isInitializingRef.current = false; // Allow re-initialization now
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facingMode, preferredMimeType, simplerMp4MimeType, fallbackMimeType, performFullCleanup]); // Removed state dependencies like errorMessage, isInitializing, recorderStatus

    // --- Ref Callback --- Trigger initialization when the video node is attached
    const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
        console.log("videoRefCallback executed. Node:", node);
        if (node && !videoRef.current) { // Only run if node exists and ref isn't already set
            console.log("Attaching node to videoRef.current and calling initializeCamera.");
            videoRef.current = node;
            initializeCamera(); // Initialize first time ref is set
        } else if (!node) {
            // This might be called on unmount
            console.log("videoRefCallback called with null node (likely unmount/cleanup).");
            // Cleanup is handled by the main unmount effect
        }
    }, [initializeCamera]); // Depends on initializeCamera

    // --- Effects ---

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            console.log("Component unmounting. Performing full cleanup.");
            isMountedRef.current = false;
            performFullCleanup();
        };
    }, [performFullCleanup]); // Depends only on cleanup function

    // Handle initialization *after* first mount (via callback ref) and on facingMode changes
    useEffect(() => {
        console.log(`FacingMode effect running. Current facingMode: ${facingMode}. videoRef ready: ${!!videoRef.current}. isInitializing: ${isInitializingRef.current}`);
        // If the ref is already set (meaning the callback ran and initial setup happened),
        // re-initialize when facingMode changes, but only if not already initializing.
        if (videoRef.current && !isInitializingRef.current) {
            console.log("FacingMode changed, ref exists, not initializing: re-initializing camera.");
            initializeCamera();
        } else if (isInitializingRef.current) {
            console.log("FacingMode effect: Skipping initialize because initialization is already in progress.");
        }
        // Cleanup for the *previous* facingMode stream is handled by initializeCamera itself.
    }, [facingMode, initializeCamera]);

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

                // Start cleanup immediately *before* calling onCapture
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

    // Start recording - uses actualMimeType
    const startRecording = useCallback(() => {
        // Check status *before* trying to record
        if (recorderStatus === 'error' || !streamRef.current || isInitializing || errorMessage === "Video recording is not supported by your browser/device.") {
            console.error("Cannot start recording due to error state, lack of stream, initialization, or unsupported format.");
            // Optionally show a message to the user here if needed
            return;
        }
        setRecorderStatus('recording');
        chunks.current = [];

        const onDataAvailable = (e: BlobEvent) => {
            if (e.data.size > 0) {
                chunks.current.push(e.data);
            }
        };

        // Pass the determined actualMimeType
        const success = mediaRecorderRef.current.startRecording(onDataAvailable, actualMimeType);
        if (!success) {
            console.error("Failed to start media recorder.");
            setErrorMessage("Failed to start recording."); // Provide user feedback
            if (isMountedRef.current) {
                setRecorderStatus('idle'); // Revert status if start fails immediately
            }
        }

    }, [actualMimeType, recorderStatus, isInitializing, errorMessage]); // Ensure all dependencies are listed

    // Stop recording - handles blob creation and file naming
    const stopRecording = useCallback(async () => {
        setRecorderStatus('stopping');

        const recorderInstance = mediaRecorderRef.current.getRecorderInstance();

        const recordedBlob = await new Promise<Blob | null>((resolve) => {
            if (recorderInstance) {
                const onStop = () => {
                    recorderInstance.removeEventListener('stop', onStop); // Clean up listener
                    if (chunks.current.length > 0) {
                        let blobType = actualMimeType; // Default to the type we requested
                        // Use the recorder's reported mimeType if available and different, it's more reliable
                        if (recorderInstance.mimeType && recorderInstance.mimeType !== actualMimeType) {
                            console.log(`Recorder used mimeType: ${recorderInstance.mimeType}`);
                            blobType = recorderInstance.mimeType;
                        }
                        const blob = new Blob(chunks.current, { type: blobType });
                        resolve(blob);
                    } else {
                        console.warn("No data chunks recorded.");
                        resolve(null);
                    }
                };

                // Add listener before stopping
                recorderInstance.addEventListener('stop', onStop);
                mediaRecorderRef.current.stopRecording();

                // Timeout fallback in case 'stop' event doesn't fire reliably
                setTimeout(() => {
                    // Check if already resolved by onStop
                    // This is a bit tricky; ideally, onStop works consistently.
                    // If chunks exist but we haven't resolved, try creating the blob.
                    // This might lead to double resolution if not handled carefully,
                    // but let's rely on onStop primarily.
                    console.warn("Stop event might not have fired within timeout.");
                }, 1500); // Adjust timeout as needed

            } else {
                console.warn("MediaRecorder instance not found during stop.");
                resolve(null);
            }
        });

        if (recordedBlob) {
            // Determine file extension based on the blob's actual MIME type
            const finalMimeType = recordedBlob.type || actualMimeType; // Use blob type if available
            const fileExtension = finalMimeType.includes('mp4') ? 'mp4' : finalMimeType.includes('webm') ? 'webm' : 'bin'; // Basic extension logic
            const fileName = `video-${Date.now()}.${fileExtension}`;

            console.log(`Creating file: ${fileName} with type: ${finalMimeType}`);

            const file = new File([recordedBlob], fileName, { type: finalMimeType });

            // Cleanup *before* calling onCapture
            await performFullCleanup();

            if (isMountedRef.current) {
                setRecorderStatus('idle');
            }

            onCapture(file); // Call onCapture *after* cleanup starts

        } else {
            console.error("Failed to create recorded blob.");
            if (isMountedRef.current) {
                setRecorderStatus('idle'); // Reset status even on failure
            }
            await performFullCleanup(); // Still cleanup on failure
        }
    }, [onCapture, performFullCleanup, actualMimeType]); // Depend on actualMimeType

    // Handle mode switch with proper cleanup
    const handleModeChange = useCallback((newMode: 'photo' | 'video') => {
        if (recorderStatus === 'recording') {
            stopRecording(); // Stop recording before switching modes
        }
        setMode(newMode);
    }, [recorderStatus, stopRecording]);

    // Close and cleanup
    const handleClose = useCallback(() => {
        if (recorderStatus === 'recording') {
            // Stop recording first, but don't process the data
            mediaRecorderRef.current.stopRecording();
            if (isMountedRef.current) {
                setRecorderStatus('idle');
            }
        }
        // Perform *immediate* minimal cleanup first to release camera quickly
        mediaRecorderRef.current.immediateCleanup();
        // Then, start thorough async cleanup and close when done
        performFullCleanup().then(() => {
            if (isMountedRef.current) { // Check mount status again after async cleanup
                onClose();
            }
        });
    }, [recorderStatus, onClose, performFullCleanup]);

    // Handle file upload - slightly updated file naming
    const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file.');
            return;
        }

        try {
            setIsUploading(true);

            // Create a copy, normalize name, use original extension
            const extension = file.name.split('.').pop() || 'mp4'; // Default to mp4 if no extension
            const videoFile = new File(
                [file],
                `video-upload-${Date.now()}.${extension}`,
                { type: file.type }
            );

            // Cleanup camera resources if they were open *before* calling onCapture
            await performFullCleanup();

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

            onCapture(videoFile); // Call onCapture *after* cleanup starts
        } catch (error) {
            console.error('Error processing uploaded video:', error);
        } finally {
            // Check mount status before setting state
            if (isMountedRef.current) {
                setIsUploading(false);
            }
        }
    }, [onCapture, performFullCleanup]);

    // Trigger file input click
    const triggerFileUpload = useCallback(() => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, []);

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
                    "bg-background flex flex-col overflow-hidden relative",
                    isMobile
                        ? "w-full h-full"
                        : "w-full max-w-3xl rounded-lg max-h-[90vh]"
                )}
            >
                {(isInitializing && recorderStatus !== 'error') && (
                    <div className="absolute inset-0 z-40 bg-background/90 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 p-8 bg-background rounded-lg shadow-xl">
                            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <p>Initializing camera...</p>
                        </div>
                    </div>
                )}
                {(isCleaning || isUploading) && (
                    <div className="absolute inset-0 z-40 bg-background/90 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 p-8 bg-background rounded-lg shadow-xl">
                            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <p>
                                {isUploading
                                    ? "Processing video..."
                                    : "Releasing camera..."}
                            </p>
                        </div>
                    </div>
                )}
                {(recorderStatus === 'error' || (errorMessage && errorMessage.includes("permission")) || (errorMessage && errorMessage.includes("supported"))) && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
                        <p className="text-destructive text-lg font-semibold mb-2">Camera Issue</p>
                        <p className="text-neutral-200 mb-4">{errorMessage || 'An unknown camera error occurred.'}</p>
                        {!(errorMessage && (errorMessage.includes("blocked") || errorMessage.includes("supported"))) && (
                            <Button variant="outline" size="sm" onClick={() => initializeCamera()} disabled={isInitializing}>
                                {isInitializing ? "Retrying..." : "Try Again"}
                            </Button>
                        )}
                        {errorMessage && errorMessage.includes("blocked") && (
                            <p className="text-sm text-neutral-400 mt-2">Check browser site settings to grant access.</p>
                        )}
                    </div>
                )}

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

                <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden">
                    {/* Countdown Timer */}
                    {countdown !== null && (
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="text-white text-8xl font-bold animate-pulse">
                                {countdown}
                            </div>
                        </div>
                    )}

                    <video
                        ref={videoRefCallback}
                        autoPlay
                        playsInline
                        muted
                        className={cn(
                            "w-full h-full object-contain",
                            facingMode === 'user' && "transform scale-x-[-1]",
                            (recorderStatus === 'error' && errorMessage) && "invisible"
                        )}
                        data-testid="camera-feed"
                    />

                    <canvas
                        ref={canvasRef}
                        className="hidden"
                    />
                </div>

                <div className={cn(
                    "p-6 flex justify-center items-center gap-4",
                    isMobile ? "bg-black" : "bg-background/80 backdrop-blur-sm"
                )}>
                    {mode === 'photo' ? (
                        <>
                            <Button
                                size="lg"
                                className="rounded-full w-16 h-16 p-0 relative hover:bg-primary/90 transition-colors"
                                onClick={() => capturePhoto(false)}
                                data-testid="capture-button"
                                disabled={isInitializing || (recorderStatus === 'error' && !!errorMessage)}
                            >
                                <div className="absolute inset-2 rounded-full border-4 border-white bg-transparent" />
                                <div className="absolute inset-4 rounded-full bg-white" />
                            </Button>
                            <Button
                                variant={isMobile ? "ghost" : "outline"}
                                className={isMobile ? "text-white" : ""}
                                onClick={() => capturePhoto(true)}
                                disabled={isInitializing || (recorderStatus === 'error' && !!errorMessage)}
                            >
                                3s
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                size="lg"
                                className="rounded-full w-16 h-16 p-0 relative hover:bg-primary/90 transition-colors"
                                onClick={recorderStatus === 'recording' ? stopRecording : startRecording}
                                variant={recorderStatus === 'recording' ? 'destructive' : 'default'}
                                data-testid="capture-button"
                                disabled={
                                    isInitializing ||
                                    recorderStatus === 'stopping' ||
                                    recorderStatus === 'error' ||
                                    !!errorMessage
                                }
                            >
                                {recorderStatus === 'recording' ? (
                                    <div className="w-8 h-8 bg-white rounded-sm" />
                                ) : recorderStatus === 'stopping' ? (
                                    <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-destructive" />
                                )}
                            </Button>

                            {recorderStatus === 'recording' && (
                                <div className="text-destructive animate-pulse font-semibold">
                                    REC
                                </div>
                            )}

                            {(recorderStatus === 'idle' || recorderStatus === 'error') && !isInitializing && process.env.NODE_ENV === 'development' && (
                                <Button
                                    variant={isMobile ? "ghost" : "outline"}
                                    className={cn(
                                        "flex items-center gap-2 ml-2",
                                        isMobile && isDarkMode && "text-white"
                                    )}
                                    onClick={triggerFileUpload}
                                    aria-label="Upload video"
                                    disabled={isUploading}
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