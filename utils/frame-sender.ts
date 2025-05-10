/**
 * Utility for sending frames from a video stream to a WebSocket endpoint.
 * Used for real-time frame analysis during recording.
 */

import { grabPreviewFrame } from './frame-grabber';

interface FrameSenderOptions {
  /** WebSocket URL to send frames to */
  wsUrl: string;
  /** Session ID to identify the stream */
  sessionId: string;
  /** Interval in seconds between frames (default: 2) */
  frameRateSec?: number;
  /** Target size for captured frames (default: 512px width) */
  frameSize?: number;
  /** JPEG quality (0-1) for frames (default: 0.85) */
  quality?: number;
  /** Optional callback when a frame is captured */
  onFrameCaptured?: (frameBlob: Blob) => void;
  /** Optional callback when connection is closed */
  onConnectionClosed?: () => void;
  /** Optional callback when an error occurs */
  onError?: (error: Error) => void;
}

export class FrameSender {
  private ws: WebSocket | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private videoSource: HTMLVideoElement | MediaStream;
  private options: Required<Omit<FrameSenderOptions, 'onFrameCaptured' | 'onConnectionClosed' | 'onError'>> & 
    Pick<FrameSenderOptions, 'onFrameCaptured' | 'onConnectionClosed' | 'onError'>;
  private isConnected = false;
  private isSending = false;
  
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
  }

  /**
   * Start sending frames to the WebSocket endpoint
   */
  public start(): void {
    if (this.isSending) return;
    
    // Create WebSocket connection with session ID
    const wsUrl = `${this.options.wsUrl}?session=${this.options.sessionId}`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      this.isConnected = true;
      this.startSendingFrames();
    };
    
    this.ws.onclose = () => {
      this.isConnected = false;
      this.isSending = false;
      this.stopInterval();
      this.options.onConnectionClosed?.();
    };
    
    this.ws.onerror = (event) => {
      this.options.onError?.(new Error('WebSocket error'));
      this.stop();
    };
  }
  
  /**
   * Stop sending frames and close the WebSocket connection
   */
  public stop(): void {
    this.isSending = false;
    this.stopInterval();
    
    if (this.ws) {
      if (this.isConnected) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
  
  /**
   * Start the interval for sending frames
   */
  private startSendingFrames(): void {
    this.isSending = true;
    
    // Start the interval to send frames
    this.intervalId = setInterval(async () => {
      if (!this.isConnected || !this.isSending) return;
      
      try {
        // Capture frame from video
        const frameBlob = await grabPreviewFrame(
          this.videoSource, 
          this.options.frameSize, 
          this.options.quality
        );
        
        // Notify if callback provided
        this.options.onFrameCaptured?.(frameBlob);
        
        // Send the frame if connection is open
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(await frameBlob.arrayBuffer());
        }
      } catch (error) {
        console.error('Error capturing or sending frame:', error);
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, this.options.frameRateSec * 1000);
  }
  
  /**
   * Stop the interval for sending frames
   */
  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
} 