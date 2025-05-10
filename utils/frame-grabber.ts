/**
 * Utility for grabbing frames from a video element or stream.
 * Used for real-time frame capture during recording.
 */

/**
 * Capture a frame from a video element and return it as a Blob.
 * 
 * @param video The video element or MediaStream to capture from
 * @param size The target size (width) for the captured frame
 * @param quality JPEG quality (0-1)
 * @returns Promise that resolves to a JPEG Blob
 */
export async function grabPreviewFrame(
  videoSource: HTMLVideoElement | MediaStream,
  size: number = 512,
  quality: number = 0.85
): Promise<Blob> {
  // Create an offscreen canvas
  const canvas = document.createElement('canvas');
  
  let videoWidth: number;
  let videoHeight: number;
  
  // Handle either MediaStream or HTMLVideoElement
  if (videoSource instanceof HTMLVideoElement) {
    videoWidth = videoSource.videoWidth;
    videoHeight = videoSource.videoHeight;
  } else {
    // For MediaStream, create a temporary video element
    const tempVideo = document.createElement('video');
    tempVideo.srcObject = videoSource;
    await new Promise<void>((resolve) => {
      tempVideo.onloadedmetadata = () => {
        tempVideo.play().then(() => resolve());
      };
    });
    videoWidth = tempVideo.videoWidth;
    videoHeight = tempVideo.videoHeight;
    
    // Draw and clean up
    canvas.width = size;
    canvas.height = (size / videoWidth) * videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
    tempVideo.pause();
    tempVideo.srcObject = null;
    return new Promise((resolve) => canvas.toBlob(
      (blob) => resolve(blob || new Blob()), 
      'image/jpeg', 
      quality
    ));
  }
  
  // Calculate aspect ratio
  const aspectRatio = videoWidth / videoHeight;
  
  // Set canvas dimensions based on target size
  canvas.width = size;
  canvas.height = size / aspectRatio;
  
  // Get context and draw the video frame
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Draw the current frame
  ctx.drawImage(
    videoSource, 
    0, 0, 
    canvas.width, canvas.height
  );
  
  // Convert to JPEG blob
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob || new Blob()), 
      'image/jpeg', 
      quality
    );
  });
} 