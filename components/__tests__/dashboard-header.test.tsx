import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardHeader } from '../dashboard-header'; // Adjust path as needed
import { vi } from 'vitest';

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    FileDown: () => <svg data-testid="filedown-icon" />,
    Plus: () => <svg data-testid="plus-icon" />,
    ListFilter: () => <svg data-testid="listfilter-icon" />,
    Tag: () => <svg data-testid="tag-icon" />,
    Home: () => <svg data-testid="home-icon" />,
  };
});

const mockProps = {
  hasAssets: true,
  isSelectionMode: false,
  selectedCount: 0,
  isDeleting: false,
  onToggleSelectionMode: vi.fn(),
  onBulkDelete: vi.fn(),
  onAddNewAsset: vi.fn(),
  searchTerm: '',
  onSearchChange: vi.fn(),
  onOpenBulkTagModal: vi.fn(),
  onOpenBulkRoomModal: vi.fn(),
  onExportPdf: vi.fn(),
};

describe('DashboardHeader', () => {
  it('renders the "Export PDF" button when hasAssets is true and not in selection mode', () => {
    render(<DashboardHeader {...mockProps} />);
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    expect(exportButton).toBeInTheDocument();
    expect(exportButton).not.toBeDisabled();
  });

  it('disables the "Export PDF" button when hasAssets is false', () => {
    render(<DashboardHeader {...mockProps} hasAssets={false} />);
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    expect(exportButton).toBeInTheDocument(); // Still in document but should be disabled
    expect(exportButton).toBeDisabled();
  });

  it('hides the "Export PDF" button when in selection mode', () => {
    render(<DashboardHeader {...mockProps} isSelectionMode={true} />);
    const exportButton = screen.queryByRole('button', { name: /export pdf/i });
    expect(exportButton).not.toBeInTheDocument();
  });

  // Test for other buttons to ensure they render correctly
  it('renders "Add New" and "Select" buttons when not in selection mode', () => {
    render(<DashboardHeader {...mockProps} />);
    expect(screen.getByRole('button', { name: /add new/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select/i })).toBeInTheDocument();
  });

  it('renders bulk action buttons when in selection mode and has selected items', () => {
    render(<DashboardHeader {...mockProps} isSelectionMode={true} selectedCount={1} />);
    expect(screen.getByRole('button', { name: /delete \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /room/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
