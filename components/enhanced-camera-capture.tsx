'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StopCircle, Circle, Camera as FlipCameraIcon, RefreshCw } from 'lucide-react'; // Added RefreshCw for flip
import { cn } from '@/lib/utils';

// Define the props expected by this enhanced component
interface EnhancedCameraCaptureProps {
    onRecordingComplete: (blob: Blob) => void; // Callback when recording stops
    onCancel: () => void; // Callback for cancellation
}

const RECORDING_TIPS = [
    "Describe items clearly: mention brand, condition, and value.",
    "Move slowly and keep items in frame while talking.",
    "Mention the room you're in for automatic organization.",
    "Capture serial numbers or unique details if possible.",
    "Good lighting helps with identification!",
    "Speak one item at a time for better results."
];

// Define preferred video constraints, ensuring it's MediaTrackConstraints
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: "environment"
};

const AUDIO_CONSTRAINTS: boolean = true; // Explicitly boolean

export default function EnhancedCameraCapture({
    onRecordingComplete,
    onCancel
}: EnhancedCameraCaptureProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // --- Core Camera Logic Implementation ---

    // Function to stop existing stream tracks
    const stopStream = useCallback(() => {
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
    }, [stream]);

    // Request camera permissions and set up stream
    const setupCamera = useCallback(async (mode: 'user' | 'environment') => {
        setError(null);
        stopStream(); // Stop previous stream before starting new one
        console.log(`Attempting to get camera stream with facingMode: ${mode}`);
        try {
            // Explicitly define constraints, accessing known object properties
            const constraints: MediaStreamConstraints = {
                audio: AUDIO_CONSTRAINTS,
                video: {
                    width: VIDEO_CONSTRAINTS.width,
                    height: VIDEO_CONSTRAINTS.height,
                    facingMode: mode
                }
            };
            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setFacingMode(mode); // Update state after successfully getting stream
            console.log("Camera stream acquired successfully.");
        } catch (err) {
            console.error("Error accessing media devices:", err);
            let message = "Camera permission denied or device unavailable.";
            if (err instanceof Error && err.name === 'NotAllowedError') {
                message = "Camera permission denied. Please allow camera access in your browser settings.";
            } else if (err instanceof Error && err.name === 'NotFoundError') {
                message = `Could not find a camera matching the selected mode (${mode}).`;
            } else if (err instanceof Error && err.name === 'NotReadableError') {
                message = "Camera is already in use by another application.";
            }
            setError(message);
        }
    }, [stopStream]);

    // Start recording
    const startRecording = () => {
        if (stream && videoRef.current) {
            setError(null);
            recordedChunksRef.current = []; // Clear previous chunks
            try {
                // Determine MIME type
                const options = { mimeType: 'video/webm;codecs=vp9,opus' }; // Prefer vp9/opus if available
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.warn("VP9/Opus not supported, trying default webm");
                    options.mimeType = 'video/webm;codecs=vp8,opus';
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        console.warn("VP8/Opus not supported, trying default");
                        options.mimeType = 'video/webm'; // Fallback to default webm
                        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                            console.warn("video/webm not supported, trying mp4");
                            options.mimeType = 'video/mp4'; // Final fallback (might not work everywhere)
                            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                                throw new Error("No supported video MIME type found for recording.");
                            }
                        }
                    }
                }
                console.log("Using MIME type:", options.mimeType);

                mediaRecorderRef.current = new MediaRecorder(stream, options);

                mediaRecorderRef.current.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        console.log("Data available, chunk size:", event.data.size);
                        recordedChunksRef.current.push(event.data);
                    }
                };

                mediaRecorderRef.current.onstop = () => {
                    console.log("Recording stopped. Finalizing blob.");
                    // Use the recorded MIME type
                    const mimeType = mediaRecorderRef.current?.mimeType || 'video/webm';
                    const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                    console.log("Final blob size:", blob.size, "Type:", blob.type);
                    if (blob.size > 0) {
                        onRecordingComplete(blob);
                    } else {
                        console.error("Recording finished but blob size is 0.");
                        setError("Recording failed: No video data captured.");
                        // Optionally call onCancel() or allow retry
                        onCancel(); // Cancel if recording resulted in empty blob
                    }
                    recordedChunksRef.current = []; // Clear chunks after processing
                };

                mediaRecorderRef.current.onerror = (event) => {
                    console.error("MediaRecorder error:", event);
                    setError(`Recording error: ${(event as any)?.error?.message || 'Unknown recorder error'}`);
                    setIsRecording(false);
                    stopTipRotation();
                };

                mediaRecorderRef.current.start(1000); // Trigger dataavailable every second
                console.log("Recording started.");
                setIsRecording(true);
                startTipRotation();
            } catch (err) {
                console.error("Failed to start MediaRecorder:", err);
                setError(`Could not start recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        } else {
            setError("Camera stream not available. Cannot start recording.");
        }
    };

    // Stop recording
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log("Attempting to stop recording...");
            mediaRecorderRef.current.stop(); // This triggers the onstop handler
            setIsRecording(false);
            stopTipRotation();
        } else if (isRecording) {
            // Handle case where isRecording is true but recorder state is not 'recording'
            console.warn("Stop called while recorder state was:", mediaRecorderRef.current?.state);
            setIsRecording(false);
            stopTipRotation();
            setError("Could not properly stop recording.");
            // Consider calling onCancel() here too if needed
        }
    };

    // Toggle Camera
    const flipCamera = () => {
        if (isRecording) return; // Don't flip while recording
        const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
        setupCamera(newFacingMode);
    };

    // Setup camera on mount
    useEffect(() => {
        setupCamera(facingMode); // Use initial facingMode
        // Cleanup function
        return () => {
            stopStream();
            stopTipRotation();
            // Ensure recorder is stopped if component unmounts unexpectedly
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on mount

    // --- Tip Rotation Logic ---
    const startTipRotation = () => {
        stopTipRotation(); // Clear existing interval first
        tipIntervalRef.current = setInterval(() => {
            setCurrentTipIndex(prevIndex => (prevIndex + 1) % RECORDING_TIPS.length);
        }, 7000); // Change tip every 7 seconds
    };

    const stopTipRotation = () => {
        if (tipIntervalRef.current) {
            clearInterval(tipIntervalRef.current);
            tipIntervalRef.current = null;
        }
    };

    // --- UI Rendering ---
    return (
        <div className="w-full h-full flex flex-col bg-black relative">
            {/* Camera Preview */}
            <div className="flex-grow relative w-full h-full overflow-hidden">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    // Flip preview horizontally only for user (selfie) camera
                    className={cn(
                        "w-full h-full object-cover",
                        facingMode === 'user' && "transform scale-x-[-1]"
                    )}
                />
                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-destructive p-4 text-center z-10">
                        <p className="mb-2">{error}</p>
                        <Button variant="outline" size="sm" onClick={() => setupCamera(facingMode)} className="mt-2">
                            Retry Camera
                        </Button>
                    </div>
                )}
                {/* Recording Tips Overlay */}
                {isRecording && (
                    <Card className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/60 text-white p-2 text-xs sm:text-sm border-none shadow-lg max-w-[90%] z-10">
                        Tip: {RECORDING_TIPS[currentTipIndex]}
                    </Card>
                )}
            </div>

            {/* Controls Area */}
            <div className="flex items-center justify-center p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent absolute bottom-0 left-0 right-0 z-20">
                {/* Flip Camera Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 bottom-4 text-white bg-black/50 hover:bg-black/70 rounded-full w-12 h-12"
                    onClick={flipCamera}
                    disabled={isRecording || !stream} // Disable while recording or if no stream
                    title="Flip Camera"
                >
                    <RefreshCw className="h-6 w-6" />
                </Button>

                {/* Record/Stop Button */}
                <Button
                    variant={isRecording ? 'destructive' : 'default'}
                    size="lg"
                    className="rounded-full h-20 w-20 p-0 border-4 border-white shadow-xl transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!stream || !!error} // Disable if no stream or error
                    title={isRecording ? "Stop Recording" : "Start Recording"}
                >
                    {isRecording ? (
                        <StopCircle className="h-10 w-10" />
                    ) : (
                        <Circle className="h-10 w-10 fill-red-500 text-red-500" />
                    )}
                </Button>

                {/* Cancel Button */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-4 bottom-6 text-white hover:bg-black/50 px-4 py-2 h-auto"
                    onClick={onCancel}
                    disabled={isRecording} // Disable while recording
                    title="Cancel Recording"
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
} 