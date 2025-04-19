'use client'

import React, { useState, useMemo } from 'react'
import { useDashboardLogic } from '@/hooks/use-dashboard-logic'
import { CameraCaptureWrapper } from './camera-capture-wrapper'
import { MediaPreview } from './media-preview'
import { AssetModal } from './asset-modal'
import { AssetWithMuxData } from '@/types/mux'
import { NavBar } from '@/components/nav-bar'
import { User } from '@supabase/supabase-js'
import { DashboardHeader } from './dashboard-header'
import { AssetGrid } from './asset-grid'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package } from 'lucide-react';
import { formatCurrency } from '@/utils/format';
import { Input } from "@/components/ui/input"

type DashboardClientProps = {
    initialAssets: AssetWithMuxData[]
    user: User
    totalItems: number;
    totalValue: number;
}

export function DashboardClient({
    initialAssets,
    user,
    totalItems,
    totalValue
}: DashboardClientProps) {
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
        activeUploads,

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

    const [searchTerm, setSearchTerm] = useState('');

    const displayedAssets = useMemo(() => {
        let filtered = assets.filter(asset => {
            if (asset.media_type === 'video' && asset.is_source_video === true && asset.is_processed === true) {
                return false;
            }
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const nameMatch = asset.name?.toLowerCase().includes(term);
                const descMatch = asset.description?.toLowerCase().includes(term);
                const transcriptMatch = asset.transcript_text?.toLowerCase().includes(term);
                return nameMatch || descMatch || transcriptMatch;
            }
            return true;
        });

        return filtered;
    }, [assets, searchTerm]);

    const renderActiveUploads = () => {
        const uploads = Object.values(activeUploads);
        if (uploads.length === 0) return null;

        return (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {uploads.map((upload, index) => (
                    <div key={index} className="bg-background text-foreground border border-border rounded-lg p-3 shadow-md text-sm">
                        <p className="font-semibold">{upload.status === 'uploading' ? 'Uploading...' : upload.status === 'processing' ? 'Processing...' : upload.status === 'transcribing' ? 'Transcribing...' : upload.status === 'error' ? 'Error' : 'Complete'}</p>
                        <p>{upload.message}</p>
                    </div>
                ))}
            </div>
        );
    }

    const handleDelete = async (assetId: string) => {
        console.log(`Attempting to delete asset ${assetId}`);
        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ assetId }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete asset');
            }
            console.log("Asset delete API call successful");
            handleCloseAssetModal();
        } catch (error) {
            console.error('Error deleting asset:', error);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />
            <div className="container mx-auto p-4 sm:p-6">
                <DashboardHeader
                    hasAssets={displayedAssets.length > 0}
                    isSelectionMode={isSelectionMode}
                    selectedCount={selectedAssets.size}
                    isDeleting={isDeleting}
                    onToggleSelectionMode={handleToggleSelectionMode}
                    onBulkDelete={handleBulkDelete}
                    onAddNewAsset={handleAddNewAsset}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                />

                <div className="grid grid-cols-2 md:grid-cols-2 gap-4 my-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalItems}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Est. Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                        </CardContent>
                    </Card>
                </div>

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
                    assets={displayedAssets}
                    selectedAssets={selectedAssets}
                    isSelectionMode={isSelectionMode}
                    thumbnailTokens={thumbnailTokens}
                    mediaErrors={mediaErrors}
                    onAssetClick={handleAssetClick}
                    onCheckboxChange={toggleAssetSelection}
                    onRetryMedia={handleRetryMedia}
                    onImageError={handleMediaError}
                    fetchThumbnailToken={fetchThumbnailToken}
                />

                {selectedAsset && (
                    <AssetModal
                        asset={selectedAsset}
                        onClose={handleCloseAssetModal}
                        onDelete={handleDelete}
                    />
                )}

                {renderActiveUploads()}
            </div>
        </div>
    );
}