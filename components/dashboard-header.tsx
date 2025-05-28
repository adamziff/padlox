'use client';

import { Button } from '@/components/ui/button';
import { Plus, ListFilter, Tag, Home } from 'lucide-react';
import React from 'react';
import { Input } from "@/components/ui/input";

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
    onOpenBulkTagModal: () => void;
    onOpenBulkRoomModal: () => void;
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
    onSearchChange,
    onOpenBulkTagModal,
    onOpenBulkRoomModal
}: DashboardHeaderProps) {
    return (
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-semibold tracking-tight">Inventory Dashboard</h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                    Alpha
                </span>
            </div>

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
                            {/* Desktop bulk actions */}
                            <div className="hidden md:flex gap-2 col-span-2">
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={onBulkDelete}
                                    disabled={selectedCount === 0 || isDeleting}
                                >
                                    {isDeleting ? "Deleting..." : `Delete (${selectedCount})`}
                                </Button>

                                {/* Tag management button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={selectedCount === 0}
                                    onClick={onOpenBulkTagModal}
                                >
                                    <Tag className="mr-2 h-4 w-4" />
                                    Tags
                                </Button>

                                {/* Room management button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={selectedCount === 0}
                                    onClick={onOpenBulkRoomModal}
                                >
                                    <Home className="mr-2 h-4 w-4" />
                                    Room
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onToggleSelectionMode}
                                >
                                    Cancel
                                </Button>
                            </div>

                            {/* Mobile simplified actions */}
                            <div className="md:hidden col-span-2 flex gap-2">
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={onBulkDelete}
                                    disabled={selectedCount === 0 || isDeleting}
                                    className="flex-1"
                                >
                                    {isDeleting ? "Deleting..." : `Delete (${selectedCount})`}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onToggleSelectionMode}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                            </div>
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