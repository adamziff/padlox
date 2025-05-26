'use client';

import { Button } from '@/components/ui/button';
import { Plus, ListFilter, Tag, Home, Minus } from 'lucide-react';
import React from 'react';
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { BulkTagSelector } from '@/components/bulk-tag-selector';

interface Tag {
    id: string;
    name: string;
}

interface Room {
    id: string;
    name: string;
}

interface DashboardHeaderProps {
    hasAssets: boolean;
    isSelectionMode: boolean;
    selectedCount: number;
    isDeleting: boolean;
    availableTags: Tag[];
    availableRooms: Room[];
    onToggleSelectionMode: () => void;
    onBulkDelete: () => void;
    onBulkToggleTag: (tagId: string) => void;
    getTagStatus: (tagId: string) => 'all' | 'some' | 'none';
    onBulkAssignRoom: (roomId: string) => void;
    onBulkRemoveRoom: () => void;
    onAddNewAsset: () => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
}

export function DashboardHeader({
    hasAssets,
    isSelectionMode,
    selectedCount,
    isDeleting,
    availableTags,
    availableRooms,
    onToggleSelectionMode,
    onBulkDelete,
    onBulkToggleTag,
    getTagStatus,
    onBulkAssignRoom,
    onBulkRemoveRoom,
    onAddNewAsset,
    searchTerm,
    onSearchChange
}: DashboardHeaderProps) {
    return (
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
                <h1 className="text-2xl font-semibold tracking-tight">Inventory Dashboard</h1>
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

                                {/* Tag multiselect dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" disabled={selectedCount === 0}>
                                            <Tag className="mr-2 h-4 w-4" />
                                            Tags
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-80 p-0">
                                        <div className="p-3 border-b">
                                            <h4 className="font-medium text-sm">Manage Tags</h4>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Click tags to add/remove. Highlighted = all selected assets have this tag.
                                                Partial = some selected assets have this tag.
                                            </p>
                                        </div>
                                        <BulkTagSelector
                                            availableTags={availableTags}
                                            getTagStatus={getTagStatus}
                                            onToggleTag={onBulkToggleTag}
                                            disabled={false}
                                        />
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Room actions dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" disabled={selectedCount === 0}>
                                            <Home className="mr-2 h-4 w-4" />
                                            Room
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        {availableRooms.map((room) => (
                                            <DropdownMenuItem
                                                key={room.id}
                                                onClick={() => onBulkAssignRoom(room.id)}
                                            >
                                                <Home className="mr-2 h-4 w-4" />
                                                {room.name}
                                            </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={onBulkRemoveRoom}>
                                            <Minus className="mr-2 h-4 w-4" />
                                            Remove from Room
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

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