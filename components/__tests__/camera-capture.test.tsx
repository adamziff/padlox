import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@/test/test-utils';
import { CameraCapture } from '../camera-capture';

// Mock navigator.mediaDevices
const mockMediaDevices = {
    getUserMedia: vi.fn(),
};

Object.defineProperty(navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true,
});

// Mock HTMLMediaElement.play
beforeAll(() => {
    window.HTMLMediaElement.prototype.play = vi.fn();
});

describe('CameraCapture', () => {
    const mockOnCapture = vi.fn();
    const mockOnClose = vi.fn();

    const defaultProps = {
        onCapture: mockOnCapture,
        onClose: mockOnClose,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock successful camera access
        mockMediaDevices.getUserMedia.mockResolvedValue({
            getTracks: () => [{
                stop: vi.fn(),
            }],
        });
    });

    it('renders camera feed when permission is granted', async () => {
        await act(async () => {
            render(<CameraCapture {...defaultProps} />);
        });

        const video = screen.getByTestId('camera-feed');
        expect(video).toBeInTheDocument();
        expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({
            video: { facingMode: 'environment' },
            audio: false,
        });
    });

    it('shows error message when camera access is denied', async () => {
        // Mock camera access denial
        mockMediaDevices.getUserMedia.mockRejectedValue(new Error('Permission denied'));
        const consoleSpy = vi.spyOn(console, 'error');

        await act(async () => {
            render(<CameraCapture {...defaultProps} />);
        });

        // Wait for error to be logged
        expect(consoleSpy).toHaveBeenCalledWith('Error accessing camera:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('captures photo when capture button is clicked', async () => {
        const mockCanvas = {
            getContext: () => ({
                drawImage: vi.fn(),
            }),
            toBlob: (callback: (blob: Blob | null) => void) => {
                callback(new Blob(['test'], { type: 'image/jpeg' }));
            },
            width: 640,
            height: 480,
        };

        // Mock canvas creation
        const originalCreateElement = document.createElement;
        document.createElement = vi.fn((tagName) => {
            if (tagName === 'canvas') {
                return mockCanvas as unknown as HTMLCanvasElement;
            }
            return originalCreateElement.call(document, tagName);
        });

        await act(async () => {
            render(<CameraCapture {...defaultProps} />);
        });

        // Wait for camera feed to be ready
        const video = screen.getByTestId('camera-feed');
        expect(video).toBeInTheDocument();

        // Click capture button
        const captureButton = screen.getByTestId('capture-button');
        await act(async () => {
            fireEvent.click(captureButton);
        });

        expect(mockOnCapture).toHaveBeenCalledWith(expect.any(File));

        // Restore original createElement
        document.createElement = originalCreateElement;
    });

    it('allows switching between photo and video modes', async () => {
        await act(async () => {
            render(<CameraCapture {...defaultProps} />);
        });

        // Switch to video mode
        const videoButton = screen.getByRole('button', { name: 'Video' });
        await act(async () => {
            fireEvent.click(videoButton);
        });

        // Check if video recording button is shown
        const recordButton = screen.getByTestId('capture-button');
        expect(recordButton).toBeInTheDocument();

        // Switch back to photo mode
        const photoButton = screen.getByRole('button', { name: 'Photo' });
        await act(async () => {
            fireEvent.click(photoButton);
        });

        // Check if photo capture button is shown
        const captureButton = screen.getByTestId('capture-button');
        expect(captureButton).toBeInTheDocument();
    });

    it('stops camera stream when component unmounts', async () => {
        const mockTrackStop = vi.fn();
        mockMediaDevices.getUserMedia.mockResolvedValue({
            getTracks: () => [{
                stop: mockTrackStop,
            }],
        });

        let unmount: () => void;
        await act(async () => {
            const { unmount: u } = render(<CameraCapture {...defaultProps} />);
            unmount = u;
        });

        // Wait for camera feed
        const video = screen.getByTestId('camera-feed');
        expect(video).toBeInTheDocument();

        // Unmount component
        await act(async () => {
            unmount();
        });

        expect(mockTrackStop).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', async () => {
        await act(async () => {
            render(<CameraCapture {...defaultProps} />);
        });

        const closeButton = screen.getByRole('button', { name: 'Close camera capture' });
        await act(async () => {
            fireEvent.click(closeButton);
        });

        expect(mockOnClose).toHaveBeenCalled();
    });
}); 