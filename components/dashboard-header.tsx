'use client';

import { Button } from '@/components/ui/button';
import { Plus, ListFilter, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { Input } from "@/components/ui/input"
import { triggerHelloWorkflow } from '@/utils/temporal-client';
import { toast } from 'sonner';

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
    const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);

    const handleRunWorkflow = async () => {
        setIsRunningWorkflow(true);
        try {
            await triggerHelloWorkflow();
            toast.success('Temporal workflow triggered successfully!', {
                description: 'Check server logs for workflow results'
            });
        } catch (error) {
            console.error('Error triggering workflow:', error);
            toast.error('Failed to trigger workflow');
        } finally {
            setIsRunningWorkflow(false);
        }
    };

    return (
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-semibold tracking-tight">Inventory Dashboard</h1>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRunWorkflow}
                    disabled={isRunningWorkflow}
                    className="hidden md:flex" // Hide on mobile
                >
                    <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                    {isRunningWorkflow ? 'Running...' : 'Run Hello Workflow'}
                </Button>
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
                                onClick={handleRunWorkflow}
                                disabled={isRunningWorkflow}
                                className="col-span-1 md:hidden" // Only show on mobile
                            >
                                <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                                {isRunningWorkflow ? 'Running...' : 'Run Hello Workflow'}
                            </Button>
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