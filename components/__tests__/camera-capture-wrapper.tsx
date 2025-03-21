import { vi } from 'vitest';

// This is a mock component for testing only
export function CameraCaptureWrapper() {
    return null;
}

// Mock the dynamic import for testing
vi.mock('next/dynamic', () => () => {
    const DynamicComponent = () => null;
    DynamicComponent.displayName = 'MockDynamicCameraCapture';
    return DynamicComponent;
}); 