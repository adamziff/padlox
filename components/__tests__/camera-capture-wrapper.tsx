import { vi } from 'vitest';
import type { CameraCaptureProps } from '../camera-capture';

// This is a mock component for testing only
export function CameraCaptureWrapper(props: CameraCaptureProps) {
    return null;
}

// Mock the dynamic import for testing
vi.mock('next/dynamic', () => () => {
    const DynamicComponent = () => null;
    DynamicComponent.displayName = 'MockDynamicCameraCapture';
    return DynamicComponent;
}); 