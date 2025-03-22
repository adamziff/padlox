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
}

export function CameraCaptureWrapper(props: CameraCaptureWrapperProps) {
    const [isMounted, setIsMounted] = useState(false)

    // Clear any lingering permissions in case browser is caching them
    useEffect(() => {
        // Function to clear camera permissions by requesting and immediately stopping
        const clearCameraPermissions = async () => {
            try {
                // Request and immediately stop camera access to clear any previous permissions
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    // Immediately stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                }
            } catch (err) {
                // Ignore errors - this is just a proactive cleanup
                console.log('Ignored cleanup error:', err);
            }
        };

        // Mount cleanup - only run once when component mounts
        setIsMounted(true);

        // Cleanup function for when component unmounts
        return () => {
            setIsMounted(false);

            // Try to force clear any lingering camera usage
            const attemptForceCameraStop = async () => {
                try {
                    if (navigator.mediaDevices) {
                        // Try to access the device list to reset permissions
                        await navigator.mediaDevices.enumerateDevices();
                        // If on Chrome, you can use a technique to reset the permissions state
                        if (navigator.userAgent.includes('Chrome')) {
                            clearCameraPermissions();
                        }
                    }
                } catch (e) {
                    // Ignore errors during cleanup
                    console.log('Ignored force cleanup error:', e);
                }
            };

            // Run the cleanup attempt
            attemptForceCameraStop();
        };
    }, []);

    const handleCapture = (file: File) => {
        // Unmount the camera component immediately after capture
        setIsMounted(false);
        // Then call the onCapture handler with a small delay to ensure cleanup happens first
        setTimeout(() => props.onCapture(file), 10);
    };

    const handleClose = () => {
        // Unmount the camera component immediately
        setIsMounted(false);
        // Then call the onClose handler with a small delay to ensure cleanup happens first
        setTimeout(props.onClose, 10);
    };

    if (!isMounted) {
        return null;
    }

    return (
        <CameraCapture
            onCapture={handleCapture}
            onClose={handleClose}
        />
    );
}