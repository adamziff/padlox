'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Pencil } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Room {
    id: string;
    name: string;
}

interface ManageRoomsDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    rooms: Room[];
    onRoomUpdated: (updatedRoom: Room) => void;
    onRoomDeleted: (roomId: string) => void;
}

export function ManageRoomsDialog({
    isOpen,
    onOpenChange,
    rooms,
    onRoomUpdated,
    onRoomDeleted,
}: ManageRoomsDialogProps) {
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [editingRoomName, setEditingRoomName] = useState('');
    const [isEditSubmitting, setIsEditSubmitting] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
    const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        if (editingRoom) {
            setEditingRoomName(editingRoom.name);
        } else {
            setEditingRoomName('');
        }
        setEditError(null);
    }, [editingRoom]);

    useEffect(() => {
        setDeleteError(null);
    }, [roomToDelete]);

    const handleStartEdit = (room: Room) => {
        setEditingRoom(room);
        setRoomToDelete(null);
    };

    const handleCancelEdit = () => {
        setEditingRoom(null);
    }

    const handleSaveEdit = async () => {
        if (!editingRoom || !editingRoomName.trim()) {
            setEditError('Room name cannot be empty.');
            return;
        }
        if (editingRoom.name === editingRoomName.trim()) {
            setEditingRoom(null);
            return;
        }

        setIsEditSubmitting(true);
        setEditError(null);
        try {
            const response = await fetch(`/api/rooms/${editingRoom.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editingRoomName.trim() }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to update room (status: ${response.status})`);
            }
            onRoomUpdated(result.data);
            toast.success(`Room "${result.data.name}" updated.`);
            setEditingRoom(null);
        } catch (error: unknown) {
            setEditError(error instanceof Error ? error.message : "Could not update room.");
            toast.error(error instanceof Error ? error.message : "Could not update room.");
        } finally {
            setIsEditSubmitting(false);
        }
    };

    const handleDeleteRoomClick = (room: Room) => {
        setRoomToDelete(room);
        setEditingRoom(null);
    };

    const confirmDelete = async () => {
        if (!roomToDelete) return;

        setIsDeleteSubmitting(true);
        setDeleteError(null);
        try {
            const response = await fetch(`/api/rooms/${roomToDelete.id}`, {
                method: 'DELETE',
            });
            if (!response.ok && response.status !== 204) {
                const result = await response.json().catch(() => ({ error: 'Failed to delete room' }));
                throw new Error(result.error || `Failed to delete room (status: ${response.status})`);
            }
            onRoomDeleted(roomToDelete.id);
            toast.success(`Room "${roomToDelete.name}" deleted.`);
            setRoomToDelete(null);
        } catch (error: unknown) {
            setDeleteError(error instanceof Error ? error.message : "Could not delete room.");
            toast.error(error instanceof Error ? error.message : "Could not delete room.");
        } finally {
            setIsDeleteSubmitting(false);
        }
    };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            setEditingRoom(null);
            setRoomToDelete(null);
            setEditError(null);
            setDeleteError(null);
        }
        onOpenChange(open);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleDialogClose}>
            <DialogContent className="sm:max-w-[450px] md:sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Manage Rooms</DialogTitle>
                    <DialogDescription>
                        Edit room names or delete rooms. These actions are permanent.
                    </DialogDescription>
                </DialogHeader>

                {rooms.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        No rooms available to manage.
                    </div>
                ) : (
                    <ScrollArea className="max-h-[300px] md:max-h-[400px] pr-3 my-4">
                        <div className="space-y-2 py-1">
                            {rooms.map((room) => (
                                <div
                                    key={room.id}
                                    className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    {editingRoom?.id === room.id ? (
                                        <div className="flex-grow flex items-center gap-2">
                                            <Input
                                                value={editingRoomName}
                                                onChange={(e) => setEditingRoomName(e.target.value)}
                                                className="h-9 flex-grow"
                                                disabled={isEditSubmitting}
                                                onKeyDown={(e) => { if (e.key === 'Enter' && !isEditSubmitting) handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                                                autoFocus
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCancelEdit}
                                                disabled={isEditSubmitting}
                                                className="px-3"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={handleSaveEdit}
                                                disabled={isEditSubmitting || !editingRoomName.trim() || editingRoomName.trim() === editingRoom.name}
                                                className="px-3"
                                            >
                                                {isEditSubmitting ? 'Saving...' : 'Save'}
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium truncate flex-grow mr-2" title={room.name}>
                                                {room.name}
                                            </span>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => handleStartEdit(room)}
                                                    title="Edit room name"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDeleteRoomClick(room)}
                                                    title="Delete room"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                            {editingRoom && editError && <p className="text-sm text-destructive mt-2 text-center">{editError}</p>}
                        </div>
                    </ScrollArea>
                )}

                <DialogFooter className="mt-2">
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>

            <AlertDialog open={!!roomToDelete} onOpenChange={(open: boolean) => !open && setRoomToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete room `&quot;{roomToDelete?.name}&quot;`?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The room will be removed from all assets.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && <p className="text-sm text-destructive text-center py-2">{deleteError}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteError(null)} disabled={isDeleteSubmitting}>Cancel</AlertDialogCancel>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={isDeleteSubmitting}
                        >
                            {isDeleteSubmitting ? 'Deleting...' : 'Delete Room'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
} 