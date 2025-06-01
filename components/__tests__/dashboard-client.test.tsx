import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { DashboardClient } from '../dashboard-client'; // Adjust path
import { User } from '@supabase/supabase-js';
import { formatCurrency } from '@/utils/format'; // For verifying formatted values

// Mock jsPDF and jspdf-autotable
const mockSetProperties = vi.fn();
const mockSetFontSize = vi.fn();
const mockText = vi.fn();
const mockSave = vi.fn();
const mockAutoTable = vi.fn();

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      setProperties: mockSetProperties,
      setFontSize: mockSetFontSize,
      text: mockText,
      save: mockSave,
      autoTable: mockAutoTable, // jspdf-autotable typically adds it to the prototype
    })),
  };
});

// jspdf-autotable is a plugin, it modifies jsPDF.prototype.autoTable
// We've already mocked autoTable on the instance, which is simpler for this case.
// If autoTable was a static import, we'd mock it directly.
vi.mock('jspdf-autotable', () => ({}));


// Mock useDashboardLogic hook
const mockUseDashboardLogic = {
  showCamera: false,
  capturedFile: null,
  assets: [],
  selectedAsset: null,
  selectedAssets: new Set(),
  isSelectionMode: false,
  isDeleting: false,
  mediaErrors: {},
  thumbnailTokens: {},
  activeUploads: {},
  handleCapture: vi.fn(),
  handleSave: vi.fn(),
  handleBulkDelete: vi.fn(),
  handleAssetClick: vi.fn(),
  handleMediaError: vi.fn(),
  handleRetryMedia: vi.fn(),
  toggleAssetSelection: vi.fn(),
  fetchThumbnailToken: vi.fn(),
  handleToggleSelectionMode: vi.fn(),
  handleAddNewAsset: vi.fn(),
  handleCloseCamera: vi.fn(),
  handleCancelMediaPreview: vi.fn(),
  handleRetryMediaPreview: vi.fn(),
  handleCloseAssetModal: vi.fn(),
  totalItems: 0,
  totalValue: 0,
  handleAssetDeletedFromModal: vi.fn(),
  processClientSideAssetUpdate: vi.fn(),
  fetchAndUpdateAssetState: vi.fn(),
  getSelectedAssetsTagStatus: vi.fn(() => new Map()),
  setThumbnailTokens: vi.fn(),
};

vi.mock('@/hooks/use-dashboard-logic', () => ({
  useDashboardLogic: vi.fn(() => mockUseDashboardLogic),
}));

// Mock lucide-react icons as they are used in DashboardHeader (child of DashboardClient)
vi.mock('lucide-react', async () => {
    const actual = await vi.importActual('lucide-react');
    return {
        ...actual,
        FileDown: () => <svg data-testid="filedown-icon" />,
        Plus: () => <svg data-testid="plus-icon" />,
        ListFilter: () => <svg data-testid="listfilter-icon" />,
        DollarSign: () => <svg data-testid="dollarsign-icon" />,
        Package: () => <svg data-testid="package-icon" />,
        Settings: () => <svg data-testid="settings-icon" />,
        PlusCircle: () => <svg data-testid="pluscircle-icon" />,
        Tag: () => <svg data-testid="tag-icon" />,
        Home: () => <svg data-testid="home-icon" />,
        // Add any other icons used by sub-components if errors arise
    };
});

// Mock child components that might be heavy or cause issues if not mocked
vi.mock('@/components/nav-bar', () => ({
    NavBar: () => <div data-testid="mock-navbar">NavBar</div>
}));
vi.mock('@/components/camera-capture-wrapper', () => ({
    CameraCaptureWrapper: () => <div data-testid="mock-camera-capture">CameraCaptureWrapper</div>
}));
vi.mock('@/components/media-preview', () => ({
    MediaPreview: () => <div data-testid="mock-media-preview">MediaPreview</div>
}));
vi.mock('@/components/asset-modal', () => ({
    AssetModal: () => <div data-testid="mock-asset-modal">AssetModal</div>
}));
vi.mock('@/components/asset-grid', () => ({
    AssetGrid: () => <div data-testid="mock-asset-grid">AssetGrid</div>
}));


const mockUser = { id: 'test-user-id' } as User;

const sampleAssets = [
  {
    id: '1',
    name: 'Laptop',
    description: 'Work laptop',
    room: { id: 'r1', name: 'Office' },
    tags: [{ id: 't1', name: 'Electronics' }, { id: 't2', name: 'Work' }],
    estimated_value: 1500,
    purchase_date: '2023-01-15T00:00:00.000Z',
    serial_number: 'SN123',
    media_type: 'item',
    is_source_video: false,
    is_processed: true,
  },
  {
    id: '2',
    name: 'Camera',
    description: null, // Test null description
    room: null, // Test null room
    tags: [], // Test empty tags
    estimated_value: 750,
    purchase_date: null, // Test null purchase_date
    serial_number: null, // Test null serial_number
    media_type: 'item',
    is_source_video: false,
    is_processed: true,
  },
];

describe('DashboardClient - PDF Export', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test

    // Reset useDashboardLogic mock for each test if needed, or override specific parts
    vi.mocked(require('@/hooks/use-dashboard-logic')).useDashboardLogic.mockImplementation(() => ({
      ...mockUseDashboardLogic, // Start with base mock
      assets: sampleAssets,    // Provide sample assets for displayedAssets calculation
      displayedAssets: sampleAssets, // Assuming displayedAssets is directly returned or calculated simply
      totalItems: sampleAssets.length,
      totalValue: sampleAssets.reduce((sum, asset) => sum + (asset.estimated_value || 0), 0),
    }));
  });

  it('calls jsPDF methods with correct data when "Export PDF" is clicked', async () => {
    render(
      <DashboardClient
        initialAssets={sampleAssets}
        user={mockUser}
        initialTotalItems={sampleAssets.length}
        initialTotalValue={sampleAssets.reduce((sum, asset) => sum + (asset.estimated_value || 0), 0)}
      />
    );

    // Find and click the "Export PDF" button (it's in DashboardHeader)
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    expect(exportButton).toBeInTheDocument();

    await act(async () => {
        fireEvent.click(exportButton);
    });

    // 1. Check if jsPDF constructor was called
    expect(require('jspdf').default).toHaveBeenCalledTimes(1);

    // 2. Check document properties
    expect(mockSetProperties).toHaveBeenCalledWith({
      title: "Padlox Insurance Claim Report - Asset Inventory",
      subject: "Detailed list of assets and their estimated values",
      author: "Padlox Application",
      keywords: "inventory, assets, insurance, report",
      creator: "Padlox Application"
    });

    // 3. Check main title text call
    expect(mockText).toHaveBeenCalledWith("Insurance Claim Report - Asset Inventory", 14, 22);

    // 4. Check summary text calls
    const totalValueFormatted = formatCurrency(sampleAssets.reduce((sum, asset) => sum + (asset.estimated_value || 0), 0));
    expect(mockText).toHaveBeenCalledWith(`Total Items: ${sampleAssets.length}`, 14, expect.any(Number));
    expect(mockText).toHaveBeenCalledWith(`Total Estimated Value: ${totalValueFormatted}`, 14, expect.any(Number));

    // 5. Check autoTable call
    const expectedColumns = [
      "Name", "Description", "Room", "Tags", "Est. Value", "Purchase Date", "Serial No."
    ];
    const expectedRows = sampleAssets.map(asset => [
      asset.name || "N/A",
      asset.description || "N/A",
      asset.room?.name || "N/A",
      asset.tags?.map(t => t.name).join(", ") || "N/A",
      asset.estimated_value ? formatCurrency(asset.estimated_value) : "N/A",
      asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : "N/A",
      asset.serial_number || "N/A"
    ]);

    expect(mockAutoTable).toHaveBeenCalledTimes(1);
    expect(mockAutoTable).toHaveBeenCalledWith(expect.objectContaining({
      head: [expectedColumns],
      body: expectedRows,
      startY: expect.any(Number),
      theme: 'striped',
      headStyles: { fillColor: [22, 160, 133] },
    }));

    // 6. Check save call
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('padlox_insurance_report.pdf');
  });
});
