'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Trash2,
    Tag,
    Home,
    MoreVertical,
    X
} from 'lucide-react';

interface BulkActionsFabProps {
    selectedCount: number;
    isDeleting: boolean;
    onBulkDelete: () => void;
    onCancelSelection: () => void;
    onOpenBulkTagModal: () => void;
    onOpenBulkRoomModal: () => void;
}

export function BulkActionsFab({
    selectedCount,
    isDeleting,
    onBulkDelete,
    onCancelSelection,
    onOpenBulkTagModal,
    onOpenBulkRoomModal,
}: BulkActionsFabProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-6 right-4 z-50 md:hidden">
            <div className="flex flex-col items-end gap-3">
                {/* Selected count indicator */}
                <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium shadow-lg">
                    {selectedCount} selected
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    {/* Cancel button */}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onCancelSelection}
                        className="h-12 w-12 rounded-full shadow-lg bg-background"
                    >
                        <X className="h-5 w-5" />
                    </Button>

                    {/* Delete button */}
                    <Button
                        variant="destructive"
                        size="icon"
                        onClick={onBulkDelete}
                        disabled={isDeleting}
                        className="h-12 w-12 rounded-full shadow-lg"
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>

                    {/* More actions dropdown */}
                    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="default"
                                size="icon"
                                className="h-12 w-12 rounded-full shadow-lg"
                            >
                                <MoreVertical className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            side="left"
                            className="w-44 mr-2"
                            sideOffset={8}
                            alignOffset={0}
                            avoidCollisions={true}
                            collisionPadding={16}
                        >
                            {/* Tag management */}
                            <DropdownMenuItem
                                onClick={() => {
                                    onOpenBulkTagModal();
                                    setIsOpen(false);
                                }}
                            >
                                <Tag className="mr-2 h-4 w-4" />
                                Manage Tags
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* Room management */}
                            <DropdownMenuItem
                                onClick={() => {
                                    onOpenBulkRoomModal();
                                    setIsOpen(false);
                                }}
                            >
                                <Home className="mr-2 h-4 w-4" />
                                Manage Room
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
} 