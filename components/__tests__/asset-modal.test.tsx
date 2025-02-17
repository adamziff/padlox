import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@/test/test-utils';
import { AssetModal } from '../asset-modal';
import { Asset } from '@/types/asset';

describe('AssetModal', () => {
    const mockOnClose = vi.fn();
    const mockOnDelete = vi.fn();

    const mockAsset: Asset = {
        id: '1',
        name: 'Test Asset',
        description: 'Test Description',
        media_url: 'https://example.com/test.jpg',
        media_type: 'image' as const,
        estimated_value: 100,
        created_at: '2024-01-01T00:00:00Z',
        user_id: 'user1',
    };

    const defaultProps = {
        asset: mockAsset,
        onClose: mockOnClose,
        onDelete: mockOnDelete,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders when open', async () => {
        await act(async () => {
            render(<AssetModal {...defaultProps} />);
        });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows asset details', async () => {
        await act(async () => {
            render(<AssetModal {...defaultProps} />);
        });

        expect(screen.getByText(mockAsset.name)).toBeInTheDocument();
        expect(screen.getByText(mockAsset.description!)).toBeInTheDocument();
        expect(screen.getByText('$100.00')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
        await act(async () => {
            render(<AssetModal {...defaultProps} />);
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Close asset details' }));
        });

        expect(mockOnClose).toHaveBeenCalled();
    });

    it('shows delete confirmation dialog when delete button is clicked', async () => {
        const mockConfirm = vi.spyOn(window, 'confirm').mockImplementation(() => false);
        await act(async () => {
            render(<AssetModal {...defaultProps} />);
        });

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Delete asset' }));
        });

        expect(mockConfirm).toHaveBeenCalledWith(
            'Are you sure you want to delete this asset? This action cannot be undone.'
        );

        mockConfirm.mockRestore();
    });
}); 