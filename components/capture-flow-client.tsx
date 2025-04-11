'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Room } from '@/types/room';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, Video, Loader2, CheckCircle } from 'lucide-react';
// Placeholder for the refactored camera component
import EnhancedCameraCapture from './enhanced-camera-capture';

type CaptureStage = 'start' | 'recordingVideo' | 'takingPhotos' | 'processing' | 'complete';

interface CaptureFlowClientProps {
    userRooms: Room[];
}

export default function CaptureFlowClient({ userRooms }: CaptureFlowClientProps) {
    const router = useRouter();
    const [stage, setStage] = useState<CaptureStage>('start');
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleVideoCaptureComplete = async (videoBlob: Blob) => {
        if (!videoBlob || videoBlob.size === 0) {
            setError("No video data captured. Please try again.");
            setStage('start');
            return;
        }

        setIsSubmitting(true);
        setStage('processing');
        setError(null);
        console.log('Video captured, size:', videoBlob.size, 'Type:', videoBlob.type, 'Selected Room ID (if any):', selectedRoomId);

        let assetId: string | null = null;

        try {
            // 1. Call backend API (/api/mux/upload) to create asset record and get Mux upload URL
            console.log("Requesting Mux upload URL and creating asset record...");

            // Generate a default name for the video asset
            const defaultAssetName = `Recorded Video ${new Date().toLocaleString()}`;

            // Construct the metadata object required by the backend
            const requestBody = {
                metadata: {
                    name: defaultAssetName,
                    // description: null, // Optional: Add later if needed
                    // estimated_value: null // Optional: Add later if needed
                },
                // correlationId: undefined // Optional: Add later if needed
                // Note: roomId is not directly used by the provided /api/mux/upload route
                // It might be associated later during processing or needs a separate update mechanism.
            };

            const createUploadResponse = await fetch('/api/mux/upload', { // Use the correct route
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!createUploadResponse.ok) {
                const errorData = await createUploadResponse.json().catch(() => ({ message: 'Failed to parse error response' }));
                throw new Error(`Failed to create upload record: ${createUploadResponse.status} - ${errorData.message || 'Unknown error'}`);
            }

            // Expecting { uploadUrl, assetId, asset } based on backend route
            const { uploadUrl, assetId: returnedAssetId, asset } = await createUploadResponse.json();
            assetId = returnedAssetId; // Store assetId from the response

            if (!uploadUrl || !assetId) {
                throw new Error("Backend did not return a valid upload URL or asset ID.");
            }
            console.log(`Obtained Mux upload URL for asset ${assetId}. Asset created in DB:`, asset);

            // 2. Upload the video blob directly to Mux
            console.log("Uploading video directly to Mux...");
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: videoBlob,
                headers: {
                    'Content-Type': videoBlob.type || 'video/webm',
                },
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text().catch(() => 'Could not read Mux error response');
                throw new Error(`Mux upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
            }

            console.log(`Video successfully uploaded to Mux for asset ${assetId}. Backend processing will continue via webhooks.`);

            setSelectedRoomId(null);

        } catch (err) {
            console.error("Error during video upload/processing initiation:", err);
            setError(err instanceof Error ? err.message : "Failed to initiate video processing.");
            setStage('start');
            if (assetId) {
                console.warn(`Upload process failed for asset ${assetId}. Backend cleanup might be needed.`);
            }
        } finally {
            // Re-enable buttons on processing screen or if reverted to start
            setIsSubmitting(false);
        }
    };

    // --- Render logic based on stage ---

    // Start Screen Content
    if (stage === 'start') {
        return (
            <div className="container mx-auto px-4 py-8 flex flex-col items-center">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center">Add New Items</CardTitle>
                        <CardDescription className="text-center">Choose how you want to capture your belongings.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button
                            size="lg"
                            className="w-full h-16 text-lg"
                            onClick={() => setStage('recordingVideo')} // Move to recording stage
                        >
                            <Video className="mr-2 h-6 w-6" /> Record Video
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            className="w-full h-16 text-lg"
                            onClick={() => alert('Photo capture coming soon!')} // Placeholder
                        // onClick={() => setStage('takingPhotos')}
                        >
                            <Camera className="mr-2 h-6 w-6" /> Take Photos
                        </Button>
                        <div className="pt-4">
                            <label htmlFor="room-select" className="block text-sm font-medium text-muted-foreground mb-1">Optional: Select Room</label>
                            <Select
                                value={selectedRoomId ?? 'none'}
                                onValueChange={(value) => setSelectedRoomId(value === 'none' ? null : value)}
                            >
                                <SelectTrigger id="room-select" className="w-full">
                                    <SelectValue placeholder="No specific room" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No specific room</SelectItem>
                                    {userRooms.map((room) => (
                                        <SelectItem key={room.id} value={room.id}>
                                            {room.name}
                                        </SelectItem>
                                    ))}
                                    {/* TODO: Add 'Add New Room' option later */}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Recording Video Stage
    if (stage === 'recordingVideo') {
        return (
            <div className="fixed inset-0 bg-background z-50 flex flex-col">
                {/* Use the actual enhanced component */}
                <EnhancedCameraCapture
                    onRecordingComplete={handleVideoCaptureComplete}
                    onCancel={() => setStage('start')}
                />
                {/* Remove placeholder UI */}
            </div>
        );
    }

    // Photo Capture Stage (Placeholder)
    if (stage === 'takingPhotos') {
        return (
            <div className="container mx-auto px-4 py-8 flex flex-col items-center">
                <h1 className="text-2xl font-bold mb-4">Photo Capture (Coming Soon)</h1>
                <Button onClick={() => setStage('start')}>Back</Button>
            </div>
        );
    }

    // Processing Stage
    if (stage === 'processing') {
        return (
            <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center text-center min-h-[calc(100vh-10rem)]">
                <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary" />
                <h1 className="text-2xl font-bold mb-2">Processing Your Video...</h1>
                <p className="text-muted-foreground mb-6">Analyzing video to identify items. This usually takes 5-10 minutes depending on length.</p>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={() => setStage('start')}>Capture More Items</Button>
                    <Button onClick={() => router.push('/myhome')}>Go to My Home</Button>
                    <Button variant="secondary" onClick={() => router.push('/catalog')}>View All Items</Button>
                </div>
            </div>
        );
    }

    // Optional: Completion Stage (Could be shown briefly before navigating)
    // if (stage === 'complete') {
    //     return (
    //         <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center text-center min-h-[calc(100vh-10rem)]">
    //             <CheckCircle className="h-16 w-16 mb-4 text-green-500" />
    //             <h1 className="text-2xl font-bold mb-2">Processing Started!</h1>
    //             <p className="text-muted-foreground mb-6">We'll notify you when your items are ready. This can take several minutes.</p>
    //             <div className="flex gap-4">
    //                 <Button variant="outline" onClick={() => setStage('start')}>Capture More Items</Button>
    //                 <Button onClick={() => router.push('/myhome')}>Go to My Home</Button>
    //                 <Button variant="secondary" onClick={() => router.push('/catalog')}>View All Items</Button>
    //             </div>
    //         </div>
    //     );
    // }

    // Fallback or error state
    return (
        <div className="container mx-auto px-4 py-8 flex flex-col items-center">
            <p className="text-destructive">An unexpected error occurred.</p>
            <Button onClick={() => setStage('start')}>Try Again</Button>
        </div>
    );
} 