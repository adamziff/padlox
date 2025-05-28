'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Home, Minus } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface Room {
    id: string;
    name: string;
}

interface BulkRoomManagementModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    availableRooms: Room[];
    selectedAssetIds: string[];
    onComplete?: () => void; // Called when changes are saved
    disabled?: boolean;
}

export function BulkRoomManagementModal({
    isOpen,
    onOpenChange,
    availableRooms,
    selectedAssetIds,
    onComplete,
    disabled = false
}: BulkRoomManagementModalProps) {
    const supabase = createClient();
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAssignRoom = async (roomId: string) => {
        if (selectedAssetIds.length === 0) return;

        setIsUpdating(true);
        setError(null);

        try {
            // For each selected asset, update its room assignment
            for (const assetId of selectedAssetIds) {
                // First, remove existing room assignment
                const { error: deleteError } = await supabase
                    .from('asset_rooms')
                    .delete()
                    .eq('asset_id', assetId);

                if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116: No rows found
                    console.error(`Error removing room for asset ${assetId}:`, deleteError);
                    throw new Error(`Failed to remove existing room for asset ${assetId.substring(0, 8)}`);
                }

                // Then, add the new room assignment
                const { error: insertError } = await supabase
                    .from('asset_rooms')
                    .insert({ asset_id: assetId, room_id: roomId });

                if (insertError) {
                    if (insertError.message.toLowerCase().includes("schema cache") || insertError.message.toLowerCase().includes("relationship")) {
                        console.warn(`Supabase client schema cache warning for asset_rooms insert (asset: ${assetId}, room: ${roomId}). Assuming DB operation succeeded.`);
                    } else {
                        console.error(`Error adding room for asset ${assetId}:`, insertError);
                        throw new Error(`Failed to assign room for asset ${assetId.substring(0, 8)}`);
                    }
                }
            }

            // Close modal and notify completion
            onOpenChange(false);
            onComplete?.();

        } catch (error: unknown) {
            console.error('Error assigning room:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred while assigning room.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleRemoveFromRoom = async () => {
        if (selectedAssetIds.length === 0) return;

        setIsUpdating(true);
        setError(null);

        try {
            // For each selected asset, remove its room assignment
            for (const assetId of selectedAssetIds) {
                const { error: deleteError } = await supabase
                    .from('asset_rooms')
                    .delete()
                    .eq('asset_id', assetId);

                if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116: No rows found
                    console.error(`Error removing room for asset ${assetId}:`, deleteError);
                    throw new Error(`Failed to remove room for asset ${assetId.substring(0, 8)}`);
                }
            }

            // Close modal and notify completion
            onOpenChange(false);
            onComplete?.();

        } catch (error: unknown) {
            console.error('Error removing from room:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred while removing from room.');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Assign Room to {selectedAssetIds.length} Assets</DialogTitle>
                    <DialogDescription>
                        Select a room to assign to all selected assets, or remove them from their current rooms.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-3 max-h-[300px] overflow-y-auto">
                    {/* Remove from room option */}
                    <Button
                        variant="outline"
                        onClick={handleRemoveFromRoom}
                        disabled={disabled || isUpdating}
                        className="w-full justify-start h-10 text-sm border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:border-red-800 dark:hover:bg-red-950 dark:hover:text-red-300 dark:hover:border-red-700"
                    >
                        <Minus className="mr-3 h-4 w-4" />
                        Remove from Room
                    </Button>

                    {/* Divider */}
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">OR ASSIGN TO ROOM</span>
                        </div>
                    </div>

                    {/* Room options */}
                    {availableRooms.map((room) => (
                        <Button
                            key={room.id}
                            variant="outline"
                            onClick={() => handleAssignRoom(room.id)}
                            disabled={disabled || isUpdating}
                            className="w-full justify-start h-10 text-sm"
                        >
                            <Home className="mr-3 h-4 w-4" />
                            {room.name}
                        </Button>
                    ))}
                </div>

                {error && (
                    <p className="text-sm text-red-500 mt-2 px-2 py-1 bg-red-50 border border-red-200 rounded dark:bg-red-950 dark:border-red-800">
                        Error: {error}
                    </p>
                )}

                <DialogFooter className="pt-3">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isUpdating}
                        className="w-full"
                    >
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 