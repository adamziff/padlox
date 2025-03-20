'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import type { CameraCaptureProps } from './camera-capture'

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

    // Only render on client-side
    useEffect(() => {
        setIsMounted(true)
    }, [])

    if (!isMounted) {
        return null
    }

    return <CameraCapture {...props} />
} 