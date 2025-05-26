'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Trash2,
    Tag,
    Home,
    MoreVertical,
    Minus,
    X
} from 'lucide-react';
import { BulkTagSelector } from '@/components/bulk-tag-selector';

interface Tag {
    id: string;
    name: string;
}

interface Room {
    id: string;
    name: string;
}

interface BulkActionsFabProps {
    selectedCount: number;
    isDeleting: boolean;
    availableTags: Tag[];
    availableRooms: Room[];
    onBulkDelete: () => void;
    onBulkToggleTag: (tagId: string) => void;
    getTagStatus: (tagId: string) => 'all' | 'some' | 'none';
    onBulkAssignRoom: (roomId: string) => void;
    onBulkRemoveRoom: () => void;
    onCancelSelection: () => void;
}

export function BulkActionsFab({
    selectedCount,
    isDeleting,
    availableTags,
    availableRooms,
    onBulkDelete,
    onBulkToggleTag,
    getTagStatus,
    onBulkAssignRoom,
    onBulkRemoveRoom,
    onCancelSelection,
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
                            {/* Tag multiselect */}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Tag className="mr-2 h-4 w-4" />
                                    <span>Manage Tags</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    className="w-72 p-0"
                                    sideOffset={4}
                                    alignOffset={0}
                                    avoidCollisions={true}
                                    collisionPadding={8}
                                >
                                    <div className="p-2 border-b">
                                        <h4 className="font-medium text-xs">Manage Tags</h4>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Tap to add/remove tags
                                        </p>
                                    </div>
                                    <BulkTagSelector
                                        availableTags={availableTags}
                                        getTagStatus={getTagStatus}
                                        onToggleTag={(tagId) => {
                                            onBulkToggleTag(tagId);
                                            setIsOpen(false);
                                        }}
                                        disabled={false}
                                    />
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSeparator />

                            {/* Room actions */}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Home className="mr-2 h-4 w-4" />
                                    <span>Assign Room</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent
                                    className="w-36 max-w-36"
                                    sideOffset={4}
                                    alignOffset={0}
                                    avoidCollisions={true}
                                    collisionPadding={8}
                                >
                                    {availableRooms.map((room) => (
                                        <DropdownMenuItem
                                            key={room.id}
                                            onClick={() => {
                                                onBulkAssignRoom(room.id);
                                                setIsOpen(false);
                                            }}
                                        >
                                            <Home className="mr-2 h-3 w-3" />
                                            {room.name}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuItem
                                onClick={() => {
                                    onBulkRemoveRoom();
                                    setIsOpen(false);
                                }}
                            >
                                <Minus className="mr-2 h-4 w-4" />
                                Remove from Room
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
} 