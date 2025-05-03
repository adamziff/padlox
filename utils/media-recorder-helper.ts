// utils/media-recorder-helper.ts
// Helper type guard
export function isDOMException(error: unknown, name?: string): error is DOMException {
    return typeof error === 'object' && error !== null && 'name' in error && (name === undefined || (error as DOMException).name === name);
}

// MediaRecorder helper class
export class MediaRecorderHelper {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: BlobPart[] = [];
    private stream: MediaStream | null = null;
    private trackCleanupPromises: Promise<void>[] = [];

    async setup({ video, audio }: { video: MediaTrackConstraints, audio: boolean }): Promise<{
        status: 'idle' | 'error';
        previewStream: MediaStream | null;
        error: string | null;
    }> {
        try {
            await this.cleanup(); // Clean up any previous stream first
            console.log("MediaRecorderHelper: cleanup complete, requesting new stream...");

            this.stream = await navigator.mediaDevices.getUserMedia({
                video,
                audio
            });
            console.log("MediaRecorderHelper: Stream obtained successfully.");

            // Successfully obtained stream
            return {
                status: 'idle',
                previewStream: this.stream,
                error: null // Explicitly null on success
            };
        } catch (err) {
            // Log the actual error from getUserMedia
            console.error('MediaRecorderHelper: Failed to get media devices:', err);
            let errorMessage = 'Failed to access camera or microphone.';

            // Provide more specific error messages based on the DOMException name
            if (isDOMException(err)) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = 'Camera/Microphone permission denied. Please grant access in browser settings and refresh.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    errorMessage = 'No camera/microphone found, or the selected camera is unavailable.';
                } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    errorMessage = 'Camera/Microphone might be in use by another application or hardware error occurred.';
                } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
                    errorMessage = 'The selected camera settings (e.g., resolution) are not supported by your device.';
                } else {
                    // Keep the original error message if it's specific and informative
                    errorMessage = `Error accessing media devices: ${err.message} (${err.name})`;
                }
            } else if (err instanceof Error) {
                // Fallback for generic errors
                errorMessage = `Error accessing media devices: ${err.message}`;
            }

            console.error(`MediaRecorderHelper: Setup failed with error: ${errorMessage}`);
            // Return error status and message
            return {
                status: 'error',
                previewStream: null,
                error: errorMessage
            };
        }
    }

    startRecording(onDataAvailable: (data: BlobEvent) => void, mimeType?: string): boolean {
        if (!this.stream) {
            console.error("MediaRecorderHelper: Cannot start recording - Stream is not available.");
            return false;
        }

        this.chunks = []; // Clear previous chunks
        let options: MediaRecorderOptions = {};

        // Attempt to use the specified mimeType if provided and supported
        if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
            options.mimeType = mimeType;
            console.log(`MediaRecorderHelper: Using specified mimeType: ${mimeType}`);
        } else {
            if (mimeType) {
                console.warn(`MediaRecorderHelper: Specified mimeType "${mimeType}" not supported. Falling back to default.`);
            } else {
                console.log('MediaRecorderHelper: Using default mimeType.');
            }
            // Let the browser choose the default by passing empty options if none provided or supported.
        }

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            console.log(`MediaRecorderHelper: Recorder created. Chosen mimeType: ${this.mediaRecorder.mimeType}`);
        } catch (e) {
            console.error('MediaRecorderHelper: Error creating MediaRecorder with options:', e);
            // Fallback to default if constructor with options fails
            try {
                console.log('MediaRecorderHelper: Attempting fallback MediaRecorder creation...');
                this.mediaRecorder = new MediaRecorder(this.stream);
                console.log(`MediaRecorderHelper: Fallback recorder created. Chosen mimeType: ${this.mediaRecorder.mimeType}`);
            } catch (fallbackError) {
                console.error('MediaRecorderHelper: Error creating fallback MediaRecorder:', fallbackError);
                this.mediaRecorder = null; // Ensure recorder is null if creation fails
                return false;
            }
        }

        // Setup event listeners
        this.mediaRecorder.ondataavailable = (event) => {
            console.log(`MediaRecorderHelper: data available, size: ${event.data.size}`);
            if (event.data.size > 0) {
                this.chunks.push(event.data);
            }
        };

        this.mediaRecorder.onerror = (event) => {
            console.error('MediaRecorderHelper: MediaRecorder error event:', (event as any)?.error || event);
            // Consider adding state updates or user notifications here
        };

        this.mediaRecorder.onstop = () => {
            console.log('MediaRecorderHelper: MediaRecorder native stop event fired.');
            // Actual blob creation and promise resolution happen in stopRecording()'s listener
        };

        // Start recording
        try {
            this.mediaRecorder.start();
            console.log(`MediaRecorderHelper: Recording started. State: ${this.mediaRecorder.state}`);
            return true;
        } catch (startError) {
            console.error('MediaRecorderHelper: Error starting MediaRecorder:', startError);
            return false;
        }
    }

    stopRecording(): Promise<Blob | null> {
        console.log("MediaRecorderHelper: stopRecording called.");
        return new Promise((resolve) => {
            if (!this.mediaRecorder) {
                console.warn("MediaRecorderHelper: stopRecording - mediaRecorder is null.");
                resolve(null);
                return;
            }

            if (this.mediaRecorder.state === 'inactive') {
                console.warn("MediaRecorderHelper: stopRecording - recorder is already inactive.");
                // If inactive but chunks exist (e.g., from previous errors), try to return them
                if (this.chunks.length > 0) {
                    const blobType = this.mediaRecorder?.mimeType || undefined;
                    console.log(`MediaRecorderHelper: Creating blob from existing chunks (inactive state). Type: ${blobType}`);
                    const blob = new Blob(this.chunks, { type: blobType });
                    this.chunks = [];
                    resolve(blob);
                } else {
                    resolve(null);
                }
                return;
            }

            let resolved = false; // Flag to prevent double resolution

            // One-time listener for the stop event
            const onStop = () => {
                if (resolved) return;
                resolved = true;
                // Remove the listener immediately inside the handler
                this.mediaRecorder?.removeEventListener('stop', onStop);
                clearTimeout(stopTimeout); // Clear the safety timeout
                console.log('MediaRecorderHelper: MediaRecorder stop event received.');

                if (this.chunks.length > 0) {
                    const blobType = this.mediaRecorder?.mimeType || undefined;
                    console.log(`MediaRecorderHelper: Creating blob. Type: ${blobType}, Chunks: ${this.chunks.length}`);
                    const blob = new Blob(this.chunks, { type: blobType });
                    this.chunks = []; // Clear chunks after creating blob
                    resolve(blob);
                } else {
                    console.warn("MediaRecorderHelper: Stop event fired, but no data chunks recorded. Resolving with null.");
                    resolve(null);
                }
            };

            this.mediaRecorder.addEventListener('stop', onStop, { once: true });

            // Safety timeout in case the 'stop' event doesn't fire reliably
            const stopTimeout = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                console.warn("MediaRecorderHelper: MediaRecorder stop event timed out! Forcing resolution.");
                this.mediaRecorder?.removeEventListener('stop', onStop); // Ensure listener removal on timeout
                if (this.chunks.length > 0) {
                    const blobType = this.mediaRecorder?.mimeType || undefined;
                    console.log(`MediaRecorderHelper: Creating blob on timeout. Type: ${blobType}`);
                    const blob = new Blob(this.chunks, { type: blobType });
                    this.chunks = []; // Clear chunks
                    resolve(blob);
                } else {
                    console.warn("MediaRecorderHelper: Timeout, no chunks found. Resolving with null.");
                    resolve(null);
                }
            }, 2500); // 2.5 second timeout

            // Request the recorder to stop
            try {
                console.log("MediaRecorderHelper: Calling native mediaRecorder.stop()...");
                this.mediaRecorder.stop();
            } catch (e) {
                console.error("MediaRecorderHelper: Error calling mediaRecorder.stop():", e);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(stopTimeout);
                    this.mediaRecorder?.removeEventListener('stop', onStop);
                    resolve(null); // Indicate failure or issue by resolving null
                }
            }
        });
    }

    // Thorough cleanup
    async cleanup(): Promise<void> {
        console.log('MediaRecorderHelper: Cleanup starting...');
        try {
            // 1. Stop the media recorder if active
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                console.log('MediaRecorderHelper Cleanup: Stopping active media recorder...');
                try {
                    // We don't need the blob here, just stop it.
                    // If stopRecording promise is needed, use `await this.stopRecording();`
                    this.mediaRecorder.stop();
                } catch (e) {
                    console.warn('MediaRecorderHelper Cleanup: Ignored media recorder stop error:', e);
                }
            }
            this.mediaRecorder = null; // Release reference
            console.log('MediaRecorderHelper Cleanup: Recorder reference nulled.');

            // 2. Stop all stream tracks individually
            if (this.stream) {
                console.log('MediaRecorderHelper Cleanup: Stopping stream tracks...');
                const tracks = this.stream.getTracks();
                if (tracks.length > 0) {
                    this.trackCleanupPromises = tracks.map(track =>
                        new Promise<void>(resolve => {
                            try {
                                console.log(`MediaRecorderHelper Cleanup: Stopping track ${track.id} (${track.kind})`);
                                track.stop();
                                // Short delay might help ensure resource release on some browsers
                                setTimeout(resolve, 50);
                            } catch (e) {
                                console.warn(`MediaRecorderHelper Cleanup: Ignored track stop error for ${track.id}:`, e);
                                resolve(); // Always resolve
                            }
                        })
                    );
                    await Promise.all(this.trackCleanupPromises);
                    console.log('MediaRecorderHelper Cleanup: All stream tracks stopped.');
                } else {
                    console.log('MediaRecorderHelper Cleanup: Stream had no tracks to stop.');
                }
                this.stream = null; // Release stream reference
                console.log('MediaRecorderHelper Cleanup: Stream reference nulled.');
            } else {
                console.log('MediaRecorderHelper Cleanup: No active stream found.');
            }

            // 3. Clear internal state
            this.chunks = [];
            this.trackCleanupPromises = [];
            console.log('MediaRecorderHelper: Cleanup finished successfully.');

        } catch (error) {
            console.error('MediaRecorderHelper: Error during cleanup process:', error);
        }
    }

    // Force immediate cleanup (less safe, use for unmount scenarios)
    immediateCleanup() {
        console.log('MediaRecorderHelper: Immediate Cleanup starting...');
        if (this.stream) {
            try {
                this.stream.getTracks().forEach(track => {
                    track.stop();
                });
                console.log('MediaRecorderHelper Immediate Cleanup: Stopped all tracks.');
                this.stream = null;
            } catch (e) {
                console.warn('MediaRecorderHelper Immediate Cleanup: Ignored stream track stop error:', e);
            }
        } else {
            console.log('MediaRecorderHelper Immediate Cleanup: No stream to stop.');
        }

        if (this.mediaRecorder) {
            try {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                    console.log('MediaRecorderHelper Immediate Cleanup: Stopped media recorder.');
                }
            } catch (e) {
                console.warn('MediaRecorderHelper Immediate Cleanup: Ignored media recorder stop error:', e);
            }
            this.mediaRecorder = null;
        } else {
            console.log('MediaRecorderHelper Immediate Cleanup: No recorder instance to stop.');
        }

        this.chunks = [];
        console.log('MediaRecorderHelper: Immediate Cleanup finished.');
    }

    getStream(): MediaStream | null {
        return this.stream;
    }

    // Get the actual mimeType used by the recorder instance
    getActualMimeType(): string | undefined {
        return this.mediaRecorder?.mimeType;
    }
}