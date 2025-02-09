export async function generateVideoPoster(videoUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');

        // Set video attributes
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';

        let timeoutId: number;
        let isCleanedUp = false;

        const cleanup = () => {
            if (isCleanedUp) return;
            isCleanedUp = true;

            clearTimeout(timeoutId);
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('error', handleError);
            video.pause();
            video.src = ''; // Clear source
            video.load(); // Reset video
            video.remove(); // Remove from DOM
        };

        const handleError = () => {
            cleanup();
            reject(new Error('Failed to load video'));
        };

        const handleLoadedData = async () => {
            try {
                // Wait a tiny bit to ensure frame is loaded
                await new Promise(resolve => setTimeout(resolve, 100));

                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 300; // Fallback size if video dimensions not available
                canvas.height = video.videoHeight || 200;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error('Failed to get canvas context');
                }

                // Draw the current frame
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Get the data URL
                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

                cleanup();
                resolve(dataUrl);
            } catch (error) {
                cleanup();
                reject(error);
            }
        };

        // Add event listeners
        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('error', handleError);

        // Set timeout before loading
        timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('Timed out while generating video poster'));
        }, 10000);

        // Start loading
        video.src = videoUrl;
    });
} 