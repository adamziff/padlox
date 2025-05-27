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
import { Trash2, Pencil } from 'lucide-react'; // Using lucide-react icons
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


interface Tag {
    id: string;
    name: string;
}

interface ManageTagsDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    tags: Tag[];
    onTagUpdated: (updatedTag: Tag) => void;
    onTagDeleted: (tagId: string) => void;
}

export function ManageTagsDialog({
    isOpen,
    onOpenChange,
    tags,
    onTagUpdated,
    onTagDeleted,
}: ManageTagsDialogProps) {
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [editingTagName, setEditingTagName] = useState('');
    const [isEditSubmitting, setIsEditSubmitting] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        if (editingTag) {
            setEditingTagName(editingTag.name);
        } else {
            setEditingTagName('');
        }
        setEditError(null);
    }, [editingTag]);

    useEffect(() => {
        setDeleteError(null);
    }, [tagToDelete]);

    const handleStartEdit = (tag: Tag) => {
        setEditingTag(tag);
        setTagToDelete(null); // Ensure delete confirmation is closed if it was open
    };

    const handleCancelEdit = () => {
        setEditingTag(null);
    }

    const handleSaveEdit = async () => {
        if (!editingTag || !editingTagName.trim()) {
            setEditError('Tag name cannot be empty.');
            return;
        }
        if (editingTag.name === editingTagName.trim()) {
            setEditingTag(null);
            return;
        }

        setIsEditSubmitting(true);
        setEditError(null);
        try {
            const response = await fetch(`/api/tags/${editingTag.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editingTagName.trim() }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to update tag (status: ${response.status})`);
            }
            onTagUpdated(result.data);
            toast.success(`Tag "${result.data.name}" updated.`);
            setEditingTag(null);
        } catch (error: unknown) {
            setEditError(error instanceof Error ? error.message : "Could not update tag.");
            toast.error(error instanceof Error ? error.message : "Could not update tag.");
        } finally {
            setIsEditSubmitting(false);
        }
    };

    const handleDeleteTagClick = (tag: Tag) => {
        setTagToDelete(tag);
        setEditingTag(null); // Ensure edit mode is closed
    };

    const confirmDelete = async () => {
        if (!tagToDelete) return;

        setIsDeleteSubmitting(true);
        setDeleteError(null);
        try {
            const response = await fetch(`/api/tags/${tagToDelete.id}`, {
                method: 'DELETE',
            });
            if (!response.ok && response.status !== 204) {
                const result = await response.json().catch(() => ({ error: 'Failed to delete tag' }));
                throw new Error(result.error || `Failed to delete tag (status: ${response.status})`);
            }
            onTagDeleted(tagToDelete.id);
            toast.success(`Tag "${tagToDelete.name}" deleted.`);
            setTagToDelete(null);
        } catch (error: unknown) {
            setDeleteError(error instanceof Error ? error.message : "Could not delete tag.");
            toast.error(error instanceof Error ? error.message : "Could not delete tag.");
        } finally {
            setIsDeleteSubmitting(false);
        }
    };

    // Reset internal states when the main dialog is closed
    const handleDialogClose = (open: boolean) => {
        if (!open) {
            setEditingTag(null);
            setTagToDelete(null);
            setEditError(null);
            setDeleteError(null);
        }
        onOpenChange(open);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleDialogClose}>
            <DialogContent className="sm:max-w-[450px] md:sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Manage Tags</DialogTitle>
                    <DialogDescription>
                        Edit tag names or delete tags. These actions are permanent.
                    </DialogDescription>
                </DialogHeader>

                {tags.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        No tags available to manage.
                    </div>
                ) : (
                    <ScrollArea className="max-h-[300px] md:max-h-[400px] pr-3 my-4">
                        <div className="space-y-2 py-1">
                            {tags.map((tag) => (
                                <div
                                    key={tag.id}
                                    className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    {editingTag?.id === tag.id ? (
                                        <div className="flex-grow flex items-center gap-2">
                                            <Input
                                                value={editingTagName}
                                                onChange={(e) => setEditingTagName(e.target.value)}
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
                                                disabled={isEditSubmitting || !editingTagName.trim() || editingTagName.trim() === editingTag.name}
                                                className="px-3"
                                            >
                                                {isEditSubmitting ? 'Saving...' : 'Save'}
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium truncate flex-grow mr-2" title={tag.name}>
                                                {tag.name}
                                            </span>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => handleStartEdit(tag)}
                                                    title="Edit tag name"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDeleteTagClick(tag)}
                                                    title="Delete tag"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                            {editingTag && editError && <p className="text-sm text-destructive mt-2 text-center">{editError}</p>}
                        </div>
                    </ScrollArea>
                )}

                <DialogFooter className="mt-2">
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>

            <AlertDialog open={!!tagToDelete} onOpenChange={(open: boolean) => !open && setTagToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete tag `&quot;{tagToDelete?.name}&quot;`?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The tag will be removed from all assets.
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
                            {isDeleteSubmitting ? 'Deleting...' : 'Delete Tag'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
} 