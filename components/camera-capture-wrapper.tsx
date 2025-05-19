'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'

// Dynamically import the CameraCapture component with SSR disabled
const CameraCapture = dynamic(
    () => import('./camera-capture').then((mod) => mod.CameraCapture),
    {
        ssr: false,
        loading: () => (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-background p-8 rounded-lg flex flex-col items-center gap-4">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p>Loading camera...</p>
                </div>
            </div>
        )
    }
)

interface CameraCaptureWrapperProps {
    onCapture: (file: File) => void
    onClose: () => void
    realTimeAnalysis?: boolean
}

export function CameraCaptureWrapper(props: CameraCaptureWrapperProps) {
    const [isMounted, setIsMounted] = useState(false)

    // Effect to handle mounting and attempt cleanup on unmount
    useEffect(() => {
        // On mount, set state to true
        setIsMounted(true);
        console.log("CameraCaptureWrapper Mounted", {
            realTimeAnalysis: props.realTimeAnalysis
        });

        // Cleanup function for when component unmounts
        return () => {
            setIsMounted(false);
            console.log("CameraCaptureWrapper Unmounting");

            // Attempt to force clear any lingering camera usage proactively.
            // This is a best-effort approach as direct stream access isn't available here.
            const attemptForceCameraStop = async () => {
                try {
                    // Check if mediaDevices and getUserMedia are available
                    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                        console.log("Wrapper Unmount: Attempting proactive cleanup");
                        // Briefly request video access to potentially release holds from other contexts
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                        // Immediately stop all tracks from this temporary stream
                        stream.getTracks().forEach(track => track.stop());
                        console.log("Wrapper Unmount: Proactive cleanup stream stopped.");
                    }
                } catch (e) {
                    // Ignore errors during this proactive cleanup attempt
                    console.warn('Wrapper Unmount: Ignored error during proactive cleanup:', e);
                }
            };

            // Run the cleanup attempt
            attemptForceCameraStop();
        };
    }, [props.realTimeAnalysis]); // Empty dependency array ensures this runs only once on mount and unmount

    // Handlers now simply forward the calls after ensuring the component unmounts
    // (CameraCapture's internal cleanup handles the stream/recorder)

    const handleCapture = (file: File) => {
        console.log("Wrapper: handleCapture called");
        // Immediately trigger unmount logic for the wrapper/dynamic import
        setIsMounted(false);
        // Call the parent's onCapture handler
        props.onCapture(file);
    };

    const handleClose = () => {
        console.log("Wrapper: handleClose called");
        // Immediately trigger unmount logic for the wrapper/dynamic import
        setIsMounted(false);
        // Call the parent's onClose handler
        props.onClose();
    };

    // Only render CameraCapture if the component is mounted client-side
    if (!isMounted) {
        return null;
    }

    // Render the dynamically imported CameraCapture component
    return (
        <CameraCapture
            onCapture={handleCapture}
            onClose={handleClose}
            realTimeAnalysis={props.realTimeAnalysis}
        />
    );
}