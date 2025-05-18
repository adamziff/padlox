/**
 * Utility for sending frames from a video stream to an API endpoint.
 * Used for real-time frame analysis during recording.
 */

import { grabPreviewFrame } from './frame-grabber';

interface FrameSenderOptions {
  /** API URL to send frames to */
  apiUrl: string;
  /** Session ID to identify the stream */
  sessionId: string;
  /** User ID who owns the recording (optional) */
  userId?: string;
  /** MUX asset ID of the video (optional) */
  muxAssetId?: string;
  /** Interval in seconds between frames (default: 2) */
  frameRateSec?: number;
  /** Target size for captured frames (default: 512px width) */
  frameSize?: number;
  /** JPEG quality (0-1) for frames (default: 0.85) */
  quality?: number;
  /** Optional callback when a frame is captured */
  onFrameCaptured?: (frameBlob: Blob) => void;
  /** Optional callback when an error occurs */
  onError?: (error: Error) => void;
}

export class FrameSender {
  private intervalId: NodeJS.Timeout | null = null;
  private videoSource: HTMLVideoElement | MediaStream;
  private options: Required<Omit<FrameSenderOptions, 'onFrameCaptured' | 'onError' | 'userId' | 'muxAssetId'>> & 
    Pick<FrameSenderOptions, 'onFrameCaptured' | 'onError' | 'userId' | 'muxAssetId'>;
  private isSending = false;
  private startTime: number;
  
  /**
   * Create a new FrameSender instance
   */
  constructor(videoSource: HTMLVideoElement | MediaStream, options: FrameSenderOptions) {
    this.videoSource = videoSource;
    this.options = {
      ...options,
      frameRateSec: options.frameRateSec ?? 2,
      frameSize: options.frameSize ?? 512,
      quality: options.quality ?? 0.85
    };
    
    // Initialize start time to when this instance is created
    this.startTime = Date.now();
    
    console.log('FrameSender: Created instance with options:', {
      apiUrl: this.options.apiUrl,
      sessionId: this.options.sessionId,
      userId: this.options.userId ?? 'not provided',
      muxAssetId: this.options.muxAssetId ?? 'not provided',
      frameRateSec: this.options.frameRateSec,
      frameSize: this.options.frameSize
    });
  }

  /**
   * Start sending frames to the API endpoint
   */
  public start(): void {
    if (this.isSending) {
      console.log('FrameSender: Already sending frames, ignoring start call');
      return;
    }
    
    // Reset start time when we actually start sending
    this.startTime = Date.now();
    
    console.log('FrameSender: Starting frame capture', {
      apiUrl: this.options.apiUrl,
      sessionId: this.options.sessionId,
      userId: this.options.userId ?? 'not provided',
      muxAssetId: this.options.muxAssetId ?? 'not provided',
      frameRateSec: this.options.frameRateSec,
      startTime: new Date(this.startTime).toISOString()
    });
    
    this.isSending = true;
    this.startSendingFrames();
  }
  
  /**
   * Stop sending frames
   */
  public stop(): void {
    console.log('FrameSender: Stopping frame capture');
    this.isSending = false;
    this.stopInterval();
  }
  
  /**
   * Get current video timestamp in seconds
   */
  private getCurrentTimestamp(): number {
    const elapsedMs = Date.now() - this.startTime;
    return elapsedMs / 1000; // Convert to seconds
  }
  
  /**
   * Start the interval for sending frames
   */
  private startSendingFrames(): void {
    console.log(`FrameSender: Setting up interval for every ${this.options.frameRateSec}s`);
    
    // Start the interval to send frames
    this.intervalId = setInterval(async () => {
      if (!this.isSending) return;
      
      try {
        console.log('FrameSender: Capturing frame');
        // Capture frame from video
        const frameBlob = await grabPreviewFrame(
          this.videoSource, 
          this.options.frameSize, 
          this.options.quality
        );
        
        console.log(`FrameSender: Frame captured, size: ${Math.round(frameBlob.size/1024)}KB`);
        
        // Notify if callback provided
        this.options.onFrameCaptured?.(frameBlob);
        
        // Get current timestamp in seconds
        const timestamp = this.getCurrentTimestamp();
        
        // Send the frame to the API endpoint
        await this.sendFrame(frameBlob, timestamp);
      } catch (error) {
        console.error('FrameSender: Error capturing or sending frame:', error);
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, this.options.frameRateSec * 1000);
    
    // Immediately capture first frame
    this.captureAndSendFrame();
  }
  
  /**
   * Capture and send a single frame
   */
  private async captureAndSendFrame(): Promise<void> {
    if (!this.isSending) return;
    
    try {
      console.log('FrameSender: Capturing initial frame');
      // Capture frame from video
      const frameBlob = await grabPreviewFrame(
        this.videoSource, 
        this.options.frameSize, 
        this.options.quality
      );
      
      console.log(`FrameSender: Initial frame captured, size: ${Math.round(frameBlob.size/1024)}KB`);
      
      // Notify if callback provided
      this.options.onFrameCaptured?.(frameBlob);
      
      // Initial frame is at timestamp 0
      const timestamp = 0;
      
      // Send the frame to the API endpoint
      await this.sendFrame(frameBlob, timestamp);
    } catch (error) {
      console.error('FrameSender: Error capturing or sending initial frame:', error);
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Send a frame to the API endpoint
   */
  private async sendFrame(frameBlob: Blob, timestamp: number): Promise<void> {
    // Build the API URL with query parameters
    let apiUrl = `${this.options.apiUrl}?session=${this.options.sessionId}`;
    
    // Add optional user ID if provided
    if (this.options.userId) {
      console.log(`FrameSender: Adding user_id ${this.options.userId} to request`);
      apiUrl += `&user_id=${this.options.userId}`;
    } else {
      console.log(`FrameSender: No user_id available to add to request`);
    }
    
    // Add optional MUX asset ID if provided
    if (this.options.muxAssetId) {
      console.log(`FrameSender: Adding mux_asset_id ${this.options.muxAssetId} to request`);
      apiUrl += `&mux_asset_id=${this.options.muxAssetId}`;
    } else {
      console.log(`FrameSender: No mux_asset_id available to add to request`);
    }
    
    console.log(`FrameSender: Sending frame to ${apiUrl}, timestamp: ${timestamp.toFixed(2)}s, size: ${Math.round(frameBlob.size/1024)}KB`);
    
    const formData = new FormData();
    formData.append('frame', frameBlob, 'frame.jpg');
    formData.append('timestamp', timestamp.toString());
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text');
        throw new Error(`Failed to send frame: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      console.log(`FrameSender: Frame sent successfully at timestamp ${timestamp.toFixed(2)}s`);
    } catch (error) {
      console.error('FrameSender: Network error sending frame:', error);
      throw error;
    }
  }
  
  /**
   * Stop the interval
   */
  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
} 