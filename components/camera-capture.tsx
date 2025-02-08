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

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
            setStream(null)
        }
    }

    async function takePhoto() {
        if (!videoRef.current) return

        const canvas = document.createElement('canvas')
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(videoRef.current, 0, 0)
        canvas.toBlob((blob) => {
            if (!blob) return
            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
            onCapture(file)
        }, 'image/jpeg')
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

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' })
            const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' })
            onCapture(file)
        }

        mediaRecorder.start()
        setIsRecording(true)
    }

    function stopRecording() {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
    }

    // Start camera when component mounts
    useEffect(() => {
        startCamera()
        return () => stopCamera()
    }, [mode])

    return (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
            <div className="p-4 flex justify-between items-center border-b">
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <CrossIcon />
                </Button>
                <div className="flex gap-2">
                    <Button
                        variant={mode === 'photo' ? 'default' : 'outline'}
                        onClick={() => setMode('photo')}
                    >
                        Photo
                    </Button>
                    <Button
                        variant={mode === 'video' ? 'default' : 'outline'}
                        onClick={() => setMode('video')}
                    >
                        Video
                    </Button>
                </div>
                <div className="w-10" /> {/* Spacer for alignment */}
            </div>

            <div className="flex-1 relative bg-black">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
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
    )
} 