'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { CrossIcon, PlusIcon } from './icons'

interface CameraCaptureProps {
    onCapture: (file: File) => void
    onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [isRecording, setIsRecording] = useState(false)
    const [mode, setMode] = useState<'photo' | 'video'>('photo')
    const videoRef = useRef<HTMLVideoElement>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])

    async function startCamera() {
        // Stop any existing stream first
        await stopCamera()

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: mode === 'video'
            })
            setStream(mediaStream)
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream
            }
        } catch (err) {
            console.error('Error accessing camera:', err)
        }
    }

    async function stopCamera() {
        // Stop all tracks
        if (stream) {
            const tracks = stream.getTracks()
            tracks.forEach(track => {
                track.stop()
            })
            setStream(null)
        }
        // Clear video source
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
    }

    async function takePhoto() {
        if (!videoRef.current || !stream) return

        try {
            // Take the photo first
            const canvas = document.createElement('canvas')
            // Use the intrinsic video dimensions to get the full uncropped image
            const videoWidth = videoRef.current.videoWidth
            const videoHeight = videoRef.current.videoHeight
            canvas.width = videoWidth
            canvas.height = videoHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight)

            // Stop the camera immediately
            await stopCamera()

            // Create the file after camera is stopped
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/jpeg')
            )
            if (!blob) return

            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
            onCapture(file)
        } catch (error) {
            console.error('Error taking photo:', error)
        }
    }

    function startRecording() {
        if (!stream) return

        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        chunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data)
            }
        }

        // Capture first frame for thumbnail
        if (videoRef.current) {
            const canvas = document.createElement('canvas')
            canvas.width = videoRef.current.videoWidth
            canvas.height = videoRef.current.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0)
                canvas.toBlob((blob) => {
                    if (blob) {
                        const thumbnailUrl = URL.createObjectURL(blob)
                        if (videoRef.current) {
                            videoRef.current.poster = thumbnailUrl
                        }
                    }
                }, 'image/jpeg')
            }
        }

        mediaRecorder.start()
        setIsRecording(true)
    }

    async function stopRecording() {
        if (!mediaRecorderRef.current || !isRecording) return

        try {
            // Get the recording data
            const recorder = mediaRecorderRef.current
            const recordingChunks = chunksRef.current

            // Create a promise that resolves when the recording stops
            const recordingData = await new Promise<Blob>((resolve) => {
                recorder.onstop = () => {
                    const blob = new Blob(recordingChunks, { type: 'video/webm' })
                    resolve(blob)
                }
                recorder.stop()
            })

            // Stop the camera immediately after getting the recording
            await stopCamera()

            // Create the file after camera is stopped
            const file = new File([recordingData], `video-${Date.now()}.webm`, { type: 'video/webm' })
            setIsRecording(false)
            onCapture(file)
        } catch (error) {
            console.error('Error stopping recording:', error)
            setIsRecording(false)
        }
    }

    // Handle camera initialization and cleanup
    useEffect(() => {
        startCamera()
        return () => {
            stopCamera()
        }
    }, [mode])

    // Handle mode changes
    function handleModeChange(newMode: 'photo' | 'video') {
        if (isRecording) {
            stopRecording()
        }
        setMode(newMode)
    }

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-background flex flex-col w-full max-w-3xl rounded-lg overflow-hidden max-h-[90vh]">
                <div className="p-4 flex justify-between items-center border-b">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                            await stopCamera()
                            onClose()
                        }}
                    >
                        <CrossIcon />
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'photo' ? 'default' : 'outline'}
                            onClick={() => handleModeChange('photo')}
                            disabled={isRecording}
                        >
                            Photo
                        </Button>
                        <Button
                            variant={mode === 'video' ? 'default' : 'outline'}
                            onClick={() => handleModeChange('video')}
                            disabled={isRecording}
                        >
                            Video
                        </Button>
                    </div>
                    <div className="w-10" />
                </div>

                <div className="relative bg-black flex items-center justify-center flex-1 min-h-0">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain"
                    />
                </div>

                <div className="p-6 flex justify-center bg-background/80 backdrop-blur-sm">
                    {mode === 'photo' ? (
                        <Button
                            size="lg"
                            className="rounded-full w-16 h-16 p-0 relative hover:bg-primary/90 transition-colors"
                            onClick={takePhoto}
                        >
                            <div className="absolute inset-2 rounded-full border-4 border-white bg-transparent" />
                            <div className="absolute inset-4 rounded-full bg-white" />
                        </Button>
                    ) : (
                        <Button
                            size="lg"
                            className="rounded-full w-16 h-16 p-0 relative hover:bg-primary/90 transition-colors"
                            onClick={isRecording ? stopRecording : startRecording}
                            variant={isRecording ? "destructive" : "default"}
                        >
                            {isRecording ? (
                                <div className="w-8 h-8 rounded-sm bg-destructive" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-destructive animate-pulse" />
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
} 
