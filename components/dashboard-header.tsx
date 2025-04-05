'use client';

import { Button } from './ui/button';
import { TrashIcon } from './icons';
import React from 'react';

type DashboardHeaderProps = {
    hasAssets: boolean;
    isSelectionMode: boolean;
    selectedCount: number;
    isDeleting: boolean;
    onToggleSelectionMode: () => void;
    onBulkDelete: () => void;
    onAddNewAsset: () => void;
};

export function DashboardHeader({
    hasAssets,
    isSelectionMode,
    selectedCount,
    isDeleting,
    onToggleSelectionMode,
    onBulkDelete,
    onAddNewAsset,
}: DashboardHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h1 className="text-2xl font-bold text-foreground">My Assets</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                {hasAssets && (
                    <Button
                        variant="outline"
                        onClick={onToggleSelectionMode}
                        className="w-full sm:w-auto"
                    >
                        {isSelectionMode ? 'Cancel Selection' : 'Select Multiple'}
                    </Button>
                )}
                {isSelectionMode && selectedCount > 0 && (
                    <Button
                        variant="destructive"
                        onClick={onBulkDelete}
                        disabled={isDeleting}
                        className="w-full sm:w-auto"
                    >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedCount})
                    </Button>
                )}
                <Button
                    onClick={onAddNewAsset}
                    className="w-full sm:w-auto"
                >
                    Add New Asset
                </Button>
            </div>
        </div>
    );
} 