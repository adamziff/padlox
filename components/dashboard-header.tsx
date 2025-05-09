'use client';

import { Button } from '@/components/ui/button';
import { Plus, ListFilter } from 'lucide-react';
import React from 'react';
import { Input } from "@/components/ui/input"

interface DashboardHeaderProps {
    hasAssets: boolean;
    isSelectionMode: boolean;
    selectedCount: number;
    isDeleting: boolean;
    onToggleSelectionMode: () => void;
    onBulkDelete: () => void;
    onAddNewAsset: () => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
}

export function DashboardHeader({
    hasAssets,
    isSelectionMode,
    selectedCount,
    isDeleting,
    onToggleSelectionMode,
    onBulkDelete,
    onAddNewAsset,
    searchTerm,
    onSearchChange
}: DashboardHeaderProps) {

    return (
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Inventory Dashboard</h1>

            <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
                <Input
                    type="search"
                    placeholder="Search items..."
                    className="w-full md:w-[200px] lg:w-[300px] order-1 md:order-none"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2 w-full md:flex md:w-auto md:gap-2 order-2 md:order-none mt-2 md:mt-0">
                    {isSelectionMode ? (
                        <>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={onBulkDelete}
                                disabled={selectedCount === 0 || isDeleting}
                                className="col-span-1"
                            >
                                {isDeleting ? "Deleting..." : `Delete (${selectedCount})`}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onToggleSelectionMode}
                                className="col-span-1"
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onToggleSelectionMode}
                                disabled={!hasAssets}
                                className="col-span-1"
                            >
                                <ListFilter className="mr-2 h-4 w-4" /> Select
                            </Button>
                            <Button
                                size="sm"
                                onClick={onAddNewAsset}
                                className="col-span-1"
                            >
                                <Plus className="mr-2 h-4 w-4" /> Add New
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
} 