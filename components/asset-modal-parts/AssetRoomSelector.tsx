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
    // Consider passing down a global error/success display mechanism from AssetModal if needed
}

export function AssetRoomSelector({
    asset: initialAsset,
    availableRooms,
    onAssetUpdate
}: AssetRoomSelectorProps) {
    const supabase = createClient();
    const [currentRoomId, setCurrentRoomId] = useState<string>(initialAsset.room?.id || "no-room");
    const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
    const [roomUpdateError, setRoomUpdateError] = useState<string | null>(null);

    useEffect(() => {
        setCurrentRoomId(initialAsset.room?.id || "no-room");
    }, [initialAsset.room]);

    const handleUpdateRoom = async (newRoomIdValue: string) => {
        const newRoomId = newRoomIdValue === "no-room" ? null : newRoomIdValue;

        // Prevent update if the room hasn't actually changed
        if (newRoomId === (initialAsset.room?.id || null) && newRoomId !== null) {
            // If newRoomId is not null and it's the same as current, do nothing.
            // This check is a bit complex, mainly to allow re-selecting "No Room" even if it was already no room.
            if (newRoomId !== null && newRoomId === currentRoomId) return;
        } else if (newRoomId === null && !initialAsset.room?.id) {
            // Both are no-room, do nothing
            return;
        }

        setIsUpdatingRoom(true);
        setRoomUpdateError(null);

        try {
            // 1. Delete existing room assignment (if any)
            // This is safe because an asset can only be in one room due to UNIQUE constraint on asset_id in asset_rooms
            const { error: deleteError } = await supabase
                .from('asset_rooms')
                .delete()
                .eq('asset_id', initialAsset.id);

            // PGRST116: No rows found (means no previous room, which is fine)
            if (deleteError && deleteError.code !== 'PGRST116') {
                throw deleteError;
            }

            let newRoomObject: Room | null = null;
            if (newRoomId) {
                const { error: insertError } = await supabase
                    .from('asset_rooms')
                    .insert({ asset_id: initialAsset.id, room_id: newRoomId });

                if (insertError) {
                    // Log schema cache error but proceed if DB write likely succeeded.
                    if (insertError.message.toLowerCase().includes("schema cache") || insertError.message.toLowerCase().includes("relationship")) {
                        console.warn(`Supabase client schema cache might be stale for asset_rooms relationship (asset: ${initialAsset.id}, room: ${newRoomId}), but operation likely succeeded if DB constraints are met. Error: ${insertError.message}`);
                    } else {
                        throw insertError; // Rethrow other critical errors
                    }
                }
                newRoomObject = availableRooms.find(r => r.id === newRoomId) || null;
            }

            setCurrentRoomId(newRoomId || "no-room");

            // Construct the updated asset with full relations for the parent
            // Fetching the full asset again here to ensure all data is fresh after update
            const { data: refreshedAsset, error: refreshError } = await supabase
                .from('assets')
                .select('*, asset_rooms(rooms(*)), asset_tags(tags(*))')
                .eq('id', initialAsset.id)
                .single();

            if (refreshError) throw refreshError;

            if (refreshedAsset) {
                const roomLink = Array.isArray(refreshedAsset.asset_rooms) && refreshedAsset.asset_rooms.length > 0 ? refreshedAsset.asset_rooms[0] : null;
                const finalRoom = roomLink ? roomLink.rooms : null;
                const tagsData = refreshedAsset.asset_tags;
                const finalTags = Array.isArray(tagsData) ? tagsData.map((at: any) => at.tags).filter(tag => tag !== null && typeof tag === 'object') : [];

                onAssetUpdate({
                    ...refreshedAsset,
                    room: finalRoom,
                    tags: finalTags,
                    asset_rooms: undefined,
                    asset_tags: undefined
                } as AssetWithMuxData);
            } else {
                // Fallback: update optimistically if refresh fails
                onAssetUpdate({ ...initialAsset, room: newRoomObject });
            }
            setRoomUpdateError(null); // Clear error on success

        } catch (error: any) {
            console.error('Failed to update room:', error);
            setRoomUpdateError(error.message || 'Failed to update room.');
            // Revert optimistic UI change on error
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