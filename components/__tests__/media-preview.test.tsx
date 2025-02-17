import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@/test/test-utils';
import { MediaPreview } from '../media-preview';

describe('MediaPreview', () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const mockVideoFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
    const mockOnSave = vi.fn();
    const mockOnRetry = vi.fn();
    const mockOnCancel = vi.fn();

    const defaultProps = {
        file: mockFile,
        onSave: mockOnSave,
        onRetry: mockOnRetry,
        onCancel: mockOnCancel,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:test');
        global.URL.revokeObjectURL = vi.fn();
    });

    it('renders image preview for image files', async () => {
        await act(async () => {
            render(<MediaPreview {...defaultProps} />);
        });

        const image = screen.getByRole('img', { name: 'Preview' });
        expect(image).toBeInTheDocument();
        expect(image).toHaveAttribute('src', 'blob:test');
    });

    it('renders video preview for video files', async () => {
        await act(async () => {
            render(<MediaPreview {...defaultProps} file={mockVideoFile} />);
        });

        const video = screen.getByTestId('video-preview');
        expect(video).toBeInTheDocument();
        expect(video).toHaveAttribute('src', 'blob:test');
    });

    it('shows file size', async () => {
        await act(async () => {
            render(<MediaPreview {...defaultProps} />);
        });

        const nameInput = screen.getByLabelText('Name *');
        expect(nameInput).toBeInTheDocument();
        expect(nameInput).toHaveValue('');
    });

    it('updates preview when file changes', async () => {
        const { rerender } = render(<MediaPreview {...defaultProps} />);

        const newFile = new File(['new test'], 'new.jpg', { type: 'image/jpeg' });
        await act(async () => {
            rerender(<MediaPreview {...defaultProps} file={newFile} />);
        });

        const nameInput = screen.getByLabelText('Name *');
        expect(nameInput).toBeInTheDocument();
    });

    it('calls onSave with correct data when form is submitted', async () => {
        await act(async () => {
            render(<MediaPreview {...defaultProps} />);
        });

        // Fill in required fields
        await act(async () => {
            fireEvent.change(screen.getByLabelText('Name *'), {
                target: { value: 'Test Item' }
            });

            fireEvent.change(screen.getByLabelText('Description'), {
                target: { value: 'Test description' }
            });

            fireEvent.change(screen.getByLabelText('Estimated Value ($)'), {
                target: { value: '100' }
            });
        });

        // Submit form
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Save & Sign' }));
        });

        expect(mockOnSave).toHaveBeenCalledWith(
            'blob:test',
            {
                name: 'Test Item',
                description: 'Test description',
                estimated_value: 100
            }
        );
    });

    it('calls onRetry when retake button is clicked', async () => {
        await act(async () => {
            render(<MediaPreview {...defaultProps} />);
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Retake' }));
        });

        expect(mockOnRetry).toHaveBeenCalled();
    });

    it('calls onCancel when close button is clicked', async () => {
        await act(async () => {
            render(<MediaPreview {...defaultProps} />);
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Close media preview' }));
        });

        expect(mockOnCancel).toHaveBeenCalled();
    });
}); 