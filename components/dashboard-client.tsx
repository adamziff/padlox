'use client'

import { useDashboardLogic } from '@/hooks/use-dashboard-logic'
import { CameraCaptureWrapper } from './camera-capture-wrapper'
import { MediaPreview } from './media-preview'
import { AssetModal } from './asset-modal'
import { AssetWithMuxData } from '@/types/mux'
import { NavBar } from '@/components/nav-bar'
import { User } from '@supabase/supabase-js'
import { DashboardHeader } from './dashboard-header'
import { AssetGrid } from './asset-grid'
import React from 'react' // Import React if not already present

type DashboardClientProps = {
    initialAssets: AssetWithMuxData[]
    user: User
}

export function DashboardClient({ initialAssets, user }: DashboardClientProps) {
    const {
        showCamera,
        capturedFile,
        assets,
        selectedAsset,
        selectedAssets,
        isSelectionMode,
        isDeleting,
        mediaErrors,
        thumbnailTokens,
        activeUploads, // Assuming you might want to display upload progress somewhere

        // Handlers
        handleCapture,
        handleSave,
        handleBulkDelete,
        handleAssetClick,
        handleMediaError,
        handleRetryMedia,
        toggleAssetSelection,
        fetchThumbnailToken,
        handleToggleSelectionMode,
        handleAddNewAsset,
        handleCloseCamera,
        handleCancelMediaPreview,
        handleRetryMediaPreview,
        handleCloseAssetModal,
        handleAssetDeletedFromModal,
    } = useDashboardLogic({ initialAssets, user })

    // You might want to display active uploads here
    const renderActiveUploads = () => {
        const uploads = Object.values(activeUploads);
        if (uploads.length === 0) return null;

        return (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {uploads.map((upload, index) => (
                    <div key={index} className="bg-background text-foreground border border-border rounded-lg p-3 shadow-md text-sm">
                        <p className="font-semibold">{upload.status === 'uploading' ? 'Uploading...' : upload.status === 'processing' ? 'Processing...' : upload.status === 'transcribing' ? 'Transcribing...' : upload.status === 'error' ? 'Error' : 'Complete'}</p>
                        <p>{upload.message}</p>
                        {/* Optional: Add progress indicator here if available */}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />
            <div className="container mx-auto p-4 sm:p-6">
                <DashboardHeader
                    hasAssets={assets.length > 0}
                    isSelectionMode={isSelectionMode}
                    selectedCount={selectedAssets.size}
                    isDeleting={isDeleting}
                    onToggleSelectionMode={handleToggleSelectionMode}
                    onBulkDelete={handleBulkDelete}
                    onAddNewAsset={handleAddNewAsset}
                />

                {showCamera && (
                    <CameraCaptureWrapper
                        onCapture={handleCapture}
                        onClose={handleCloseCamera}
                    />
                )}

                {capturedFile && (
                    <MediaPreview
                        file={capturedFile}
                        onSave={handleSave}
                        onRetry={handleRetryMediaPreview}
                        onCancel={handleCancelMediaPreview}
                    />
                )}

                <AssetGrid
                    assets={assets}
                    selectedAssets={selectedAssets}
                    isSelectionMode={isSelectionMode}
                    thumbnailTokens={thumbnailTokens}
                    mediaErrors={mediaErrors}
                    onAssetClick={handleAssetClick}
                    onCheckboxChange={toggleAssetSelection}
                    onRetryMedia={handleRetryMedia}
                    onImageError={handleMediaError}
                    fetchThumbnailToken={fetchThumbnailToken} // Pass fetchThumbnailToken down
                />

                {selectedAsset && (
                    <AssetModal
                        asset={selectedAsset}
                        onClose={handleCloseAssetModal}
                        onDelete={handleAssetDeletedFromModal}
                    />
                )}

                {/* Render active upload notifications */}
                {renderActiveUploads()}
            </div>
        </div>
    );
}