'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'

// Dynamically import the CameraCaptureTemporal component with SSR disabled
const CameraCaptureTemporal = dynamic(
    () => import('./camera-capture-temporal').then((mod) => mod.CameraCaptureTemporal),
    {
        ssr: false,
        loading: () => (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-background p-8 rounded-lg flex flex-col items-center gap-4">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p>Loading camera with Temporal...</p>
                </div>
            </div>
        )
    }
)

interface CameraCaptureWrapperTemporalProps {
    onCapture: (file: File) => void
    onClose: () => void
}

export function CameraCaptureWrapperTemporal(props: CameraCaptureWrapperTemporalProps) {
    const [isMounted, setIsMounted] = useState(false)

    // Mount detection for client-side rendering
    useEffect(() => {
        setIsMounted(true)

        return () => {
            setIsMounted(false)
        }
    }, []) // Empty dependency array ensures this runs only once on mount and unmount

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

    // Render the dynamically imported CameraCaptureTemporal component
    return (
        <CameraCaptureTemporal
            onCapture={handleCapture}
            onClose={handleClose}
            realTimeAnalysis={true}
        />
    );
} 