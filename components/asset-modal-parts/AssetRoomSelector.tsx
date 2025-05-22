'use client'

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssetWithMuxData } from '@/types/mux';
import { createClient } from '@/utils/supabase/client';

// Define Room type locally if not available from a central types file
interface Room {
    id: string;
    name: string;
    // user_id?: string; // if needed by component logic
    // created_at?: string; // if needed
}

interface AssetRoomSelectorProps {
    asset: AssetWithMuxData;
    availableRooms: Room[];
    onAssetUpdate: (updatedAsset: AssetWithMuxData) => void;
    fetchAndUpdateAssetState?: (assetId: string) => Promise<void>;
    // Consider passing down a global error/success display mechanism from AssetModal if needed
}

export function AssetRoomSelector({
    asset: initialAsset,
    availableRooms,
    onAssetUpdate,
}: AssetRoomSelectorProps) {
    const supabase = createClient();
    const [currentRoomId, setCurrentRoomId] = useState<string>(initialAsset.room?.id || "no-room");
    const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
    const [roomUpdateError, setRoomUpdateError] = useState<string | null>(null);

    useEffect(() => {
        setCurrentRoomId(initialAsset.room?.id || "no-room");
    }, [initialAsset.room?.id]);

    const handleUpdateRoom = async (newRoomIdValue: string) => {
        const newTargetRoomId = newRoomIdValue === "no-room" ? null : newRoomIdValue;
        const currentActualRoomId = initialAsset.room?.id || null;

        // If the selection is the same as the current state, do nothing.
        if (newTargetRoomId === currentActualRoomId) {
            console.log('[AssetRoomSelector] Room selection is already the current state. No update needed.');
            return;
        }

        setIsUpdatingRoom(true);
        setRoomUpdateError(null);

        try {
            // 1. Delete existing room assignment.
            const { error: deleteError } = await supabase
                .from('asset_rooms')
                .delete()
                .eq('asset_id', initialAsset.id);

            if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116: No rows found
                throw deleteError;
            }
            console.log(`[AssetRoomSelector] Deleted old room assignment for asset ${initialAsset.id} (if any).`);

            let newRoomObjectForOptimisticUpdate: Room | null = null;
            if (newTargetRoomId) {
                // 2. Insert new room assignment if a new room is selected.
                const { error: insertError } = await supabase
                    .from('asset_rooms')
                    .insert({ asset_id: initialAsset.id, room_id: newTargetRoomId });

                if (insertError) {
                    if (insertError.message.toLowerCase().includes("schema cache") || insertError.message.toLowerCase().includes("relationship")) {
                        console.warn(`[AssetRoomSelector] Supabase client schema cache warning for asset_rooms insert (asset: ${initialAsset.id}, room: ${newTargetRoomId}). Assuming DB operation succeeded. Error: ${insertError.message}`);
                    } else {
                        throw insertError;
                    }
                }
                newRoomObjectForOptimisticUpdate = availableRooms.find(r => r.id === newTargetRoomId) || null;
                console.log(`[AssetRoomSelector] Inserted new room assignment for asset ${initialAsset.id} to room ${newTargetRoomId}.`);
            } else {
                console.log(`[AssetRoomSelector] Asset ${initialAsset.id} is now set to 'No Room'.`);
            }

            // Optimistically update local UI state for the dropdown selector itself
            setCurrentRoomId(newRoomIdValue);

            // Call onAssetUpdate with an optimistically constructed asset.
            // The actual state update with full data will come from the useDashboardLogic subscription
            // to asset_rooms or assets table changes which triggers fetchAndUpdateAssetState.
            onAssetUpdate({
                ...initialAsset,
                room: newRoomObjectForOptimisticUpdate
            });

            setRoomUpdateError(null); // Clear error on success

        } catch (error: unknown) {
            console.error('[AssetRoomSelector] Failed to update room:', error);
            setRoomUpdateError(error instanceof Error ? error.message : 'Failed to update room.');
            // Revert optimistic UI change for the dropdown on error
            setCurrentRoomId(initialAsset.room?.id || "no-room");
        } finally {
            setIsUpdatingRoom(false);
        }
    };

    return (
        <div>
            <Label htmlFor={`room-select-${initialAsset.id}`}>Room</Label>
            <Select
                value={currentRoomId}
                onValueChange={handleUpdateRoom}
                disabled={isUpdatingRoom}
            >
                <SelectTrigger id={`room-select-${initialAsset.id}`} className="mt-1">
                    <SelectValue placeholder="Select a room" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="no-room">No Room</SelectItem>
                    {availableRooms.map(room => (
                        <SelectItem key={room.id} value={room.id}>
                            {room.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {isUpdatingRoom && <p className="text-sm text-muted-foreground mt-1">Updating room...</p>}
            {roomUpdateError && (
                <p className="text-sm text-red-500 mt-1">
                    Error: {roomUpdateError}
                    {roomUpdateError.toLowerCase().includes("schema cache") &&
                        " (This may be a temporary client display issue. The change might have saved.)"}
                </p>
            )}
        </div>
    );
} 