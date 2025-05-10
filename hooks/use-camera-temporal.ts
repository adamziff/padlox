/**
 * Wrapper hook that integrates useCameraCore with Temporal
 */

import { useCameraCore } from './use-camera-core';
import { useCallback } from 'react';

// Re-export the UseCameraCoreProps interface
export interface UseCameraCoreProps {
  facingMode: 'user' | 'environment';
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCaptureSuccess: (file: File) => void;
  streamingUpload?: boolean;
  realTimeAnalysis?: boolean;
  onStreamComplete?: () => void;
}

// Import startVideoWorkflow only in the browser environment
let startVideoWorkflow: (assetId: string) => Promise<void>;
if (typeof window !== 'undefined') {
  // Dynamic import to avoid loading on the server
  // Use a simple callback since the utils file will be compiled to lib later
  startVideoWorkflow = async (assetId: string) => {
    try {
      // Wait for the build process to complete before trying to use Temporal
      const utils = await import('../temporal/src/utils');
      return utils.startVideoWorkflow(assetId);
    } catch (error) {
      console.error('Failed to load Temporal utils:', error);
      console.warn('Temporal workflow integration unavailable');
    }
  };
} else {
  // Server-side fallback
  startVideoWorkflow = async () => {};
}

// Re-export the hook with Temporal integration
export function useCameraTemporal(props: UseCameraCoreProps) {
  // Get the original hook functions
  const cameraCore = useCameraCore(props);
  
  // Wrap the startRecording function to also start the Temporal workflow
  const startRecordingWithTemporal = useCallback(async () => {
    // Call the original startRecording function
    await cameraCore.startRecording();
    
    // Start the Temporal workflow with a unique asset ID
    // In a real app, this would be the actual asset/session ID
    const assetId = `recording-${Date.now()}`;
    
    // Call the Temporal workflow starter
    try {
      await startVideoWorkflow(assetId);
    } catch (error) {
      console.error('Failed to start Temporal workflow:', error);
      // Continue recording even if workflow fails
    }
  }, [cameraCore.startRecording]);
  
  // Return the camera core with the wrapped startRecording function
  return {
    ...cameraCore,
    startRecording: startRecordingWithTemporal,
  };
} 