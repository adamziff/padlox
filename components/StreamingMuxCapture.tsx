`use client`

import { useState, useRef } from 'react';

// Add props type to allow signaling completion/cancel
interface StreamingMuxCaptureProps {
    onComplete: () => void;
    onCancel?: () => void;
}

export function StreamingMuxCapture({ onComplete, onCancel }: StreamingMuxCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const logRef = useRef<HTMLDivElement>(null);

    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
    const uploadUrlRef = useRef<string>('');
    const [activeUploads, setActiveUploads] = useState(0);
    const bufferRef = useRef<Blob>(new Blob());
    const [bufferSize, setBufferSize] = useState(0);
    const nextByteStartRef = useRef<number>(0);
    const [isFinalizing, setIsFinalizing] = useState(false);

    const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
    const maxRetries = 3;
    const lockName = 'mux-upload-lock';

    const log = (message: string, type: 'info' | 'chunk' | 'buffer' | 'upload' | 'error' = 'info') => {
        const ts = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-${type}`;
        entry.textContent = `[${ts}] ${message}`;
        logRef.current?.append(entry);
        logRef.current?.scrollTo(0, logRef.current.scrollHeight);
    };

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    async function requestUploadUrl() {
        const metadata = { name: `Video - ${new Date().toISOString()}` };
        const correlationId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const res = await fetch('/api/mux/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata, correlationId })
        });
        if (!res.ok) throw new Error(`Upload URL request failed: ${res.status}`);
        const { uploadUrl } = await res.json();
        uploadUrlRef.current = uploadUrl;
        return uploadUrl;
    }

    async function uploadChunk(chunk: Blob, byteStart: number, isFinalChunk: boolean) {
        if (isFinalChunk) {
            while (activeUploads > 0) await delay(100);
        }
        const byteEnd = byteStart + chunk.size - 1;
        const totalSize = isFinalChunk ? byteEnd + 1 : '*';
        const headers = {
            'Content-Length': String(chunk.size),
            'Content-Range': `bytes ${byteStart}-${byteEnd}/${totalSize}`
        };
        let attempt = 0;
        let success = false;
        setActiveUploads(n => n + 1);
        await navigator.locks.request(lockName, async () => {
            while (attempt < maxRetries && !success) {
                try {
                    const res = await fetch(uploadUrlRef.current!, { method: 'PUT', headers, body: chunk });
                    if (res.ok || res.status === 308) {
                        success = true;
                        log(`Uploaded bytes ${byteStart}-${byteEnd}`, 'upload');
                    } else {
                        throw new Error(`Status ${res.status}`);
                    }
                } catch (err: any) {
                    attempt++;
                    log(`Upload chunk failed (attempt ${attempt}): ${err.message}`, 'error');
                    if (attempt < maxRetries) await delay(attempt * 1000);
                    else throw err;
                }
            }
        });
        setActiveUploads(n => n - 1);
        return success;
    }

    const startRecording = async () => {
        try {
            const uploadUrl = await requestUploadUrl();
            log('Received upload URL', 'info');

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setMediaStream(stream);
            if (videoRef.current) videoRef.current.srcObject = stream;

            const MIME_OPTIONS = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
            const mimeType = MIME_OPTIONS.find(t => MediaRecorder.isTypeSupported(t)) || '';
            if (!mimeType) throw new Error('No supported MIME type for MediaRecorder');

            bufferRef.current = new Blob([], { type: mimeType });
            setBufferSize(0);
            nextByteStartRef.current = 0;
            setIsFinalizing(false);

            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
            setMediaRecorder(recorder);

            recorder.ondataavailable = async (e) => {
                if (e.data.size > 0 && !isFinalizing) {
                    log(`Chunk received: ${(e.data.size / (1024 * 1024)).toFixed(2)} MB`, 'chunk');
                    bufferRef.current = new Blob([bufferRef.current, e.data], { type: mimeType });
                    const newSize = bufferSize + e.data.size;
                    setBufferSize(newSize);

                    while (newSize >= CHUNK_SIZE) {
                        const chunk = bufferRef.current.slice(0, CHUNK_SIZE);
                        const chunkSize = chunk.size;
                        bufferRef.current = bufferRef.current.slice(CHUNK_SIZE);
                        setBufferSize(prev => prev - chunkSize);
                        await uploadChunk(chunk, nextByteStartRef.current, false);
                        nextByteStartRef.current += chunkSize;
                    }
                }
            };

            recorder.onstop = async () => {
                log('Recorder stopped', 'info');
                setIsFinalizing(true);
                if (bufferRef.current.size > 0) {
                    log('Uploading final chunk', 'upload');
                    await uploadChunk(bufferRef.current, nextByteStartRef.current, true);
                }
                stream.getTracks().forEach(t => t.stop());
                setMediaRecorder(null);
                log('All chunks uploaded', 'info');
                // Signal to parent that streaming/upload is complete
                onComplete();
            };

            recorder.start(500);
            log('Recording started', 'info');
        } catch (err: any) {
            log(`Start recording error: ${err.message}`, 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            log('Stopping...', 'info');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 p-4 flex flex-col items-center">
            <video ref={videoRef} autoPlay muted className="w-full max-w-md mb-4 bg-black" />
            <div ref={logRef} className="w-full h-32 overflow-y-auto bg-gray-900 text-white p-2 mb-4" />
            <div className="space-x-2">
                <button onClick={startRecording} disabled={!!mediaRecorder} className="px-4 py-2 bg-green-600 text-white rounded">Start</button>
                <button onClick={stopRecording} disabled={!mediaRecorder} className="px-4 py-2 bg-red-600 text-white rounded">Stop</button>
            </div>
        </div>
    );
} 