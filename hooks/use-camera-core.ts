import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaRecorderHelper } from '@/utils/media-recorder-helper'; // Adjust path as needed
import { FrameSender } from '@/utils/frame-sender';

// Define preferred and fallback MIME types (can be constants)
const PREFERRED_MIME_TYPE = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
const SIMPLER_MP4_MIME_TYPE = 'video/mp4';
const FALLBACK_MIME_TYPE = 'video/webm';

interface UseCameraCoreProps {
    facingMode: 'user' | 'environment';
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onCaptureSuccess: (file: File) => void; // Callback when photo capture completes
    streamingUpload?: boolean;          // true to stream chunks to Mux instead of one-shot file
    realTimeAnalysis?: boolean;        // true to enable real-time frame capturing for analysis
    onStreamComplete?: () => void;     // Callback when streaming upload completes
}

export function useCameraCore({
    facingMode,
    videoRef,
    canvasRef,
    onCaptureSuccess,
    streamingUpload = false,
    realTimeAnalysis = false,
    onStreamComplete,
}: UseCameraCoreProps) {
    const [recorderStatus, setRecorderStatus] = useState<'idle' | 'recording' | 'stopping' | 'error'>('idle');
    const [isInitializing, setIsInitializing] = useState(true);
    const [isCleaning, setIsCleaning] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [hasFrontCamera, setHasFrontCamera] = useState(false);
    const [actualMimeType, setActualMimeType] = useState<string>(FALLBACK_MIME_TYPE);

    // Internal Refs for core logic
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorderHelper>(new MediaRecorderHelper());
    const nativeRecorderRef = useRef<MediaRecorder | null>(null);
    const chunks = useRef<BlobPart[]>([]);
    const isInitializingRef = useRef(false); // Prevent race conditions during init
    const isMountedRef = useRef(true); // Track mount status for async operations
    const frameSenderRef = useRef<FrameSender | null>(null);

    // --- Streaming upload state ---
    const uploadUrlRef = useRef<string | null>(null);
    const nextByteStartRef = useRef<number>(0);
    const activeUploadsRef = useRef<number>(0);
    const bufferRef = useRef<Blob>(new Blob());
    const CHUNK_SIZE = 8 * 1024 * 1024;
    const maxRetries = 3;
    const lockName = 'mux-upload-lock';

    // --- Session state ---
    const sessionIdRef = useRef<string | null>(null);

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    // === Core Cleanup Logic ===
    // Cleanup function to stop streams and release camera resources
    const performFullCleanup = useCallback(async (source = 'unspecified') => {
        if (!isMountedRef.current) return; // Skip cleanup if unmounted
        console.log(`useCameraCore: Starting cleanup (source: ${source})`);
        setIsCleaning(true);
        
        // Stop frame sender if active
        if (frameSenderRef.current) {
            frameSenderRef.current.stop();
            frameSenderRef.current = null;
        }

        try {
            // Continue with original cleanup
            if (nativeRecorderRef.current) {
                console.log("useCameraCore: Stopping native recorder");
                if (nativeRecorderRef.current.state !== 'inactive') {
                    try {
                        nativeRecorderRef.current.stop();
                    } catch (e) {
                        console.warn("useCameraCore: Error stopping native recorder:", e);
                    }
                }
                nativeRecorderRef.current = null;
            }

            await mediaRecorderRef.current.cleanup();
            streamRef.current = null;
            chunks.current = [];

            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }

            console.log("useCameraCore: Cleanup complete");
        } catch (e) {
            console.error("useCameraCore: Error during cleanup:", e);
            // Continue despite errors - best effort
        } finally {
            if (isMountedRef.current) {
                setIsCleaning(false);
            }
        }
    }, [videoRef]);

    async function requestUploadUrl() {
        const metadata = { name: `Video - ${new Date().toISOString()}` };
        const correlationId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const res = await fetch('/api/mux/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata, correlationId })
        });
        if (!res.ok) throw new Error(`Mux upload init failed: ${res.status}`);
        const data = await res.json();
        uploadUrlRef.current = data.uploadUrl;
        sessionIdRef.current = data.sessionId || null;
        return data;
    }

    async function uploadChunk(chunk: Blob, isFinal: boolean) {
        // wait final in-flight uploads if final chunk
        if (isFinal) {
            while (activeUploadsRef.current > 0) await delay(100);
        }
        const start = nextByteStartRef.current;
        const end = start + chunk.size - 1;
        const total = isFinal ? end + 1 : '*';
        const headers = {
            'Content-Length': String(chunk.size),
            'Content-Range': `bytes ${start}-${end}/${total}`
        };
        let attempt = 0;
        let done = false;
        activeUploadsRef.current++;
        // sequential lock
        await navigator.locks.request(lockName, async () => {
            while (attempt < maxRetries && !done) {
                try {
                    const res = await fetch(uploadUrlRef.current!, { method: 'PUT', headers, body: chunk });
                    if (res.ok || res.status === 308) done = true;
                    else throw new Error(`Status ${res.status}`);
                } catch (e) {
                    attempt++;
                    if (attempt < maxRetries) await delay(attempt * 1000);
                    else throw e;
                }
            }
        });
        activeUploadsRef.current--;
        nextByteStartRef.current = end + 1;
    }

    // === Core Initialization Logic ===
    const initializeCamera = useCallback(async () => {
        if (isInitializingRef.current || !isMountedRef.current) {
            console.log(`useCameraCore: Initialize skipped. InProgress: ${isInitializingRef.current}, Mounted: ${isMountedRef.current}`);
            return;
        }
        isInitializingRef.current = true;
        console.log("useCameraCore: initializeCamera START");
        setIsInitializing(true);
        setErrorMessage(null);
        setRecorderStatus('idle');

        // 1. Permissions Check (Basic)
        let permissionsOk = true;
        let permErrorMessage: string | null = null;
        if (navigator.permissions?.query) {
            try {
                const cameraPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
                const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                if (cameraPerm.state === 'denied' || micPerm.state === 'denied') {
                    permissionsOk = false;
                    permErrorMessage = 'Camera/Microphone permission blocked. Enable in browser settings & refresh.';
                }
            } catch (permError) { console.warn("Permissions API query failed:", permError); }
        }
        if (!permissionsOk) {
            setErrorMessage(permErrorMessage);
            setRecorderStatus('error');
            setIsInitializing(false);
            isInitializingRef.current = false;
            return;
        }

        // 2. Cleanup and Setup Stream
        try {
            // Ensure previous stream/recorder is fully cleaned before setting up new one
            await performFullCleanup('initializeCamera_preSetup');
            console.log("useCameraCore: Pre-setup cleanup finished, calling setup...");

            const result = await mediaRecorderRef.current.setup({ video: { facingMode }, audio: true });

            if (!isMountedRef.current) { // Check mount status after async setup
                 console.warn("useCameraCore: Component unmounted during camera setup. Aborting initialization.");
                 isInitializingRef.current = false;
                 return; // Exit early if unmounted
            }

            if (result.error) {
                console.error("useCameraCore: Setup failed:", result.error);
                setErrorMessage(result.error);
                setRecorderStatus('error');
            }
            else if (result.previewStream && videoRef.current) {
                console.log("useCameraCore: Setup successful, assigning stream to video element.");
                streamRef.current = result.previewStream;
                videoRef.current.srcObject = result.previewStream;

                // Attempt to play video
                try {
                    await new Promise<void>((resolve, reject) => {
                        if (!videoRef.current) {
                            reject(new Error("Video ref became null before loadedmetadata"));
                            return;
                        }
                        const videoElement = videoRef.current;
                        const timeoutId = setTimeout(() => reject(new Error("Timeout waiting for loadedmetadata")), 5000);
                        videoElement.onloadedmetadata = () => {
                            clearTimeout(timeoutId);
                            console.log("useCameraCore: onloadedmetadata fired.");
                            videoElement.play()
                                .then(() => {
                                    console.log("useCameraCore: Play successful.");
                                    resolve();
                                })
                                .catch(playError => {
                                    console.error("useCameraCore: Play failed:", playError);
                                    reject(playError);
                                });
                        };
                         // Handle potential video errors directly
                         videoElement.onerror = (e) => {
                            clearTimeout(timeoutId);
                            console.error("useCameraCore: Video element error:", e);
                            reject(new Error('Video element error during setup'));
                        };
                    });

                    console.log("useCameraCore: Camera initialized successfully.");
                    
                    // Check for MIME type support
                    if (MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)) {
                        setActualMimeType(PREFERRED_MIME_TYPE);
                        console.log(`useCameraCore: Using preferred MIME type: ${PREFERRED_MIME_TYPE}`);
                    } else if (MediaRecorder.isTypeSupported(SIMPLER_MP4_MIME_TYPE)) {
                        setActualMimeType(SIMPLER_MP4_MIME_TYPE);
                        console.log(`useCameraCore: Using simpler MP4 MIME type: ${SIMPLER_MP4_MIME_TYPE}`);
                    } else if (MediaRecorder.isTypeSupported(FALLBACK_MIME_TYPE)) {
                        setActualMimeType(FALLBACK_MIME_TYPE);
                        console.log(`useCameraCore: Using fallback MIME type: ${FALLBACK_MIME_TYPE}`);
                    } else {
                        console.warn("useCameraCore: No supported MIME types found.");
                        setActualMimeType("unsupported");
                    }
                    
                } catch (playError) {
                     if (!isMountedRef.current) { // Check before setting state
                        console.warn("useCameraCore: Component unmounted during play error handling.");
                     } else {
                         console.error("useCameraCore: Play error caught:", playError);
                         setErrorMessage("Could not start camera preview. Check permissions or if camera is in use.");
                         setRecorderStatus('error');
                         // Attempt cleanup again on play error
                         await performFullCleanup('initializeCamera_playError');
                    }
                }
            } else {
                 if (isMountedRef.current) {
                    console.error("useCameraCore: Setup seemed successful but stream or videoRef invalid.");
                    setErrorMessage("Failed to initialize camera stream components.");
                    setRecorderStatus('error');
                }
            }
        } catch (err) {
            if (isMountedRef.current) {
                console.error('useCameraCore: Outer error during initialization:', err);
                setErrorMessage('An unexpected error occurred during camera setup.');
                setRecorderStatus('error');
            }
        } finally {
            if (isMountedRef.current) {
                setIsInitializing(false);
            }
             isInitializingRef.current = false; // Release lock
            console.log("useCameraCore: initializeCamera END");
        }
    }, [facingMode, videoRef, performFullCleanup]); // Dependency on videoRef

    // === Core Capture Logic ===
    const takePhoto = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || !streamRef.current || !isMountedRef.current) {
            console.warn("takePhoto: Prerequisites not met or component unmounted.");
            return;
        }
        console.log("useCameraCore: Taking photo...");
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");

            // Flip if front camera
            if (facingMode === 'user') {
                ctx.save(); // Save context state
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                ctx.restore(); // Restore context state
            } else {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }

            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            if (blob) {
                const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                console.log("useCameraCore: Photo captured, starting cleanup...");
                performFullCleanup('takePhoto_success'); // Clean up before calling callback
                onCaptureSuccess(file); // Notify parent component
            } else {
                throw new Error("Canvas toBlob returned null");
            }
        } catch (error) {
             console.error('useCameraCore: Error taking photo:', error);
            if (isMountedRef.current) {
                setErrorMessage("Failed to capture photo.");
                setRecorderStatus('error'); // Set error state
            }
            await performFullCleanup('takePhoto_error'); // Attempt cleanup on error too
        }
    }, [facingMode, videoRef, canvasRef, performFullCleanup, onCaptureSuccess]); // Dependencies

    const startRecording = useCallback(async () => {
        if (recorderStatus !== 'idle' || isInitializing || !streamRef.current || !isMountedRef.current || actualMimeType === "unsupported") {
            console.error(`useCameraCore: Cannot start recording. Status: ${recorderStatus}, Init: ${isInitializing}, Stream: ${!!streamRef.current}, Mime: ${actualMimeType}`);
            return;
        }
        console.log("useCameraCore: Starting recording...");
        setRecorderStatus('recording');

        // Setup streaming upload if requested
        if (streamingUpload) {
            try {
                // 1) Initialize direct upload URL and DB record
                console.log('useCameraCore: Requesting upload URL for streaming...');
                const uploadData = await requestUploadUrl();
                console.log('useCameraCore: Received upload data:', { 
                    uploadUrl: !!uploadData.uploadUrl, 
                    sessionId: uploadData.sessionId
                });
                
                // 2) Reset buffer/tracking
                bufferRef.current = new Blob([], { type: actualMimeType });
                nextByteStartRef.current = 0;
                activeUploadsRef.current = 0;
                
                // Store session ID for real-time analysis
                sessionIdRef.current = uploadData.sessionId || null;
                
                // 3) Create and store native MediaRecorder
                const recorder = new MediaRecorder(streamRef.current!, {
                    mimeType: actualMimeType,
                    videoBitsPerSecond: 5_000_000,
                    audioBitsPerSecond: 128_000
                });
                nativeRecorderRef.current = recorder;
                // 4) Handle incoming chunks
                recorder.ondataavailable = async (e: BlobEvent) => {
                    if (e.data.size > 0) {
                        bufferRef.current = new Blob([bufferRef.current, e.data], { type: actualMimeType });
                        while (bufferRef.current.size >= CHUNK_SIZE) {
                            const chunk = bufferRef.current.slice(0, CHUNK_SIZE);
                            bufferRef.current = bufferRef.current.slice(CHUNK_SIZE);
                            await uploadChunk(chunk, false);
                        }
                    }
                };
                // 5) On stop, flush final chunk and signal complete
                recorder.onstop = async () => {
                    console.log('useCameraCore: Streaming stop event');
                    if (bufferRef.current.size > 0) {
                        await uploadChunk(bufferRef.current, true);
                    }
                    streamRef.current?.getTracks().forEach(t => t.stop());
                    setRecorderStatus('idle');
                    console.log('useCameraCore: Streaming upload complete');
                    onStreamComplete?.();
                };
                
                // 6) Begin recording with 500ms timeslice
                recorder.start(500);
                
                // 7) If real-time analysis is enabled, start frame sender
                if (realTimeAnalysis) {
                    console.log('useCameraCore: Preparing real-time frame analysis', {
                        realTimeAnalysis, 
                        sessionId: sessionIdRef.current,
                        apiUrl: process.env.NEXT_PUBLIC_FRAME_API_URL || '/api/frame'
                    });
                    
                    if (!sessionIdRef.current) {
                        console.warn('useCameraCore: Missing sessionId for real-time analysis. Using recording timestamp as fallback.');
                        sessionIdRef.current = `manual_${Date.now()}`;
                    }
                    
                    // Get MUX asset ID if available
                    const muxAssetId = uploadData.muxAssetId || null;
                    
                    // Get user ID if available
                    const userId = uploadData.userId || null;
                    
                    console.log('useCameraCore: Frame analysis data:', {
                        sessionId: sessionIdRef.current,
                        userId: userId || 'not available',
                        muxAssetId: muxAssetId || 'not available'
                    });
                    
                    // Create and start frame sender
                    const apiUrl = process.env.NEXT_PUBLIC_FRAME_API_URL || '/api/frame';
                    frameSenderRef.current = new FrameSender(videoRef.current!, {
                        apiUrl,
                        sessionId: sessionIdRef.current,
                        userId: userId,
                        muxAssetId: muxAssetId,
                        frameRateSec: parseInt(process.env.NEXT_PUBLIC_FRAME_RATE_SEC || '2', 10),
                        onError: (error) => {
                            console.warn('Frame sender error:', error);
                            // We don't stop recording on frame sender error, just log it
                        }
                    });
                    
                    console.log('useCameraCore: Frame sender created, starting capture');
                    frameSenderRef.current.start();
                } else {
                    console.log('useCameraCore: Real-time frame analysis NOT enabled', { 
                        realTimeAnalysis, 
                        hasSessionId: !!sessionIdRef.current
                    });
                }
            } catch (error) {
                console.error('useCameraCore: Error setting up streaming recording:', error);
                setRecorderStatus('error');
                setErrorMessage('Failed to start streaming recording.');
            }
            
            return;
        }

        const onDataAvailable = (e: BlobEvent) => {
            if (e.data.size > 0) {
                chunks.current.push(e.data);
            }
        };
        const success = mediaRecorderRef.current.startRecording(onDataAvailable, actualMimeType);

        if (!success) {
            console.error("useCameraCore: Failed to start media recorder instance.");
            if (isMountedRef.current) {
                setErrorMessage("Failed to start recording process.");
                setRecorderStatus('error');
            }
        } else {
             console.log("useCameraCore: Recording started successfully.");
        }
    }, [recorderStatus, isInitializing, actualMimeType, streamingUpload, realTimeAnalysis, videoRef]); // Dependencies

    const stopRecording = useCallback(async () => {
        if (recorderStatus !== 'recording' || !isMountedRef.current) {
            console.warn(`useCameraCore: Stop recording called in invalid state (${recorderStatus}) or unmounted.`);
            return;
        }
        
        // Stop frame sender if it's running
        if (frameSenderRef.current) {
            frameSenderRef.current.stop();
            frameSenderRef.current = null;
            console.log('useCameraCore: Frame sender stopped');
        }
        
        if (streamingUpload) {
            console.log('useCameraCore: Stopping streaming recorder');
            nativeRecorderRef.current?.stop();
            nativeRecorderRef.current = null;
            return;
        }
        console.log("useCameraCore: Stopping recording...");
        setRecorderStatus('stopping');

        const recordedBlob = await mediaRecorderRef.current.stopRecording();

         // Check mount status *after* async stopRecording
         if (!isMountedRef.current) {
            console.warn("useCameraCore: Component unmounted during stopRecording process.");
            return; // Don't proceed if unmounted
        }

        if (recordedBlob) {
            // Determine file extension based on the blob's actual MIME type
            const finalMimeType = recordedBlob.type || mediaRecorderRef.current.getActualMimeType() || FALLBACK_MIME_TYPE;
            const fileExtension = finalMimeType.includes('mp4') ? 'mp4' : finalMimeType.includes('webm') ? 'webm' : 'bin';
            const fileName = `video-${Date.now()}.${fileExtension}`;
            const file = new File([recordedBlob], fileName, { type: finalMimeType });

            console.log("useCameraCore: Video recorded, starting cleanup...");
            await performFullCleanup('stopRecording_success'); // Clean up before calling callback
            onCaptureSuccess(file); // Notify parent component for photo mode
        } else {
            console.error("useCameraCore: Failed to create recorded blob after stopping.");
            setErrorMessage("Failed to save recording.");
            setRecorderStatus('error');
            await performFullCleanup('stopRecording_blobError'); // Cleanup on blob failure
        }
    }, [recorderStatus, performFullCleanup, onCaptureSuccess, streamingUpload]); // Dependencies

    // === Effects ===

    // Track mount status
    useEffect(() => {
        isMountedRef.current = true;
        console.log("useCameraCore: Mounted.");
        return () => {
            isMountedRef.current = false;
            console.log("useCameraCore: Unmounting, performing immediate cleanup...");
            // Use immediate cleanup on unmount to release resources quickly
            mediaRecorderRef.current.immediateCleanup();
            // Also stop frame sender if it's running
            if (frameSenderRef.current) {
                frameSenderRef.current.stop();
                frameSenderRef.current = null;
            }
        };
    }, []);

    // Initialize camera on mount and when facingMode changes
    useEffect(() => {
        if (videoRef.current && !isInitializingRef.current) {
            console.log("useCameraCore: Auto initialization triggered.");
            initializeCamera();
        }
    }, [facingMode, initializeCamera]); // Rerun on facingMode change or if videoRef becomes available
        // NOTE: initializeCamera and performFullCleanup are stable due to useCallback with correct deps

    // Check for available camera devices
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
        let cancelled = false;
        const checkCameras = async () => {
            try {
                console.log("useCameraCore: Checking camera devices...");
                const devices = await navigator.mediaDevices.enumerateDevices();
                if (cancelled) return;
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                console.log(`useCameraCore: Found ${videoDevices.length} video devices.`);
                if (isMountedRef.current) {
                    setHasFrontCamera(videoDevices.length > 1);
                }
            } catch (err) {
                console.error('useCameraCore: Error checking camera devices:', err);
            }
        };
        checkCameras();
        return () => { cancelled = true; }; // Cleanup for async operation
    }, []);

    // Return state and core action handlers
    return {
        recorderStatus,
        isInitializing,
        isCleaning,
        errorMessage,
        hasFrontCamera,
        // Core Actions - expose them if needed by the parent, but often better handled via UI handlers
        takePhoto, 
        startRecording, 
        stopRecording,
        initializeCamera, // Expose for retry logic
        // No need to expose performFullCleanup directly usually
    };
} 