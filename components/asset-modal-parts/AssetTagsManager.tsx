'use client'

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge";
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssetWithMuxData } from '@/types/mux';
import { createClient } from '@/utils/supabase/client';

// Define Tag type locally if not available from a central types file
interface Tag {
    id: string;
    name: string;
    // user_id?: string;
    // created_at?: string;
}

interface AssetTagsManagerProps {
    asset: AssetWithMuxData;
    availableTags: Tag[]; // All tags available to the user
    onAssetUpdate: (updatedAsset: AssetWithMuxData) => void;
    // Consider passing a global error/status update mechanism from parent AssetModal
}

export function AssetTagsManager({
    asset: initialAsset, // Renamed to avoid conflict with internal state
    availableTags,
    onAssetUpdate
}: AssetTagsManagerProps) {
    const supabase = createClient();
    // Internal asset state for this component, synced with initialAsset prop
    const [asset, setAsset] = useState<AssetWithMuxData>(initialAsset);

    const [isEditTagsModalOpen, setIsEditTagsModalOpen] = useState(false);
    const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
    const [isSavingTags, setIsSavingTags] = useState(false);
    const [editTagsError, setEditTagsError] = useState<string | null>(null);

    useEffect(() => {
        setAsset(initialAsset); // Sync asset when prop changes
        // If modal is open and asset tags change from prop, resync pending IDs
        if (isEditTagsModalOpen) {
            setPendingTagIds(initialAsset.tags?.map(t => t.id) || []);
        }
    }, [initialAsset, isEditTagsModalOpen]);

    const handleOpenEditTagsModal = () => {
        setPendingTagIds(asset.tags?.map(t => t.id) || []);
        setIsEditTagsModalOpen(true);
        setEditTagsError(null);
    };

    const handleToggleTagInEditModal = (tagId: string) => {
        setPendingTagIds(prev =>
            prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
        );
    };

    const handleSaveTagsFromEditModal = async () => {
        setIsSavingTags(true);
        setEditTagsError(null);

        const currentAssetTagIds = asset.tags?.map(t => t.id) || [];
        const tagsToAddSet = new Set(pendingTagIds.filter(id => !currentAssetTagIds.includes(id)));
        const tagsToRemoveSet = new Set(currentAssetTagIds.filter(id => !pendingTagIds.includes(id)));

        let overallError: string | null = null;

        try {
            for (const tagId of tagsToRemoveSet) {
                const { error } = await supabase
                    .from('asset_tags')
                    .delete()
                    .eq('asset_id', asset.id)
                    .eq('tag_id', tagId);
                if (error) {
                    console.error(`Error removing tag ${tagId} for asset ${asset.id}:`, error);
                    overallError = (overallError ? overallError + "; " : "") + `Failed to remove tag ID ${tagId.substring(0, 8)}`;
                }
            }

            for (const tagId of tagsToAddSet) {
                const { error } = await supabase
                    .from('asset_tags')
                    .insert({ asset_id: asset.id, tag_id: tagId });
                if (error) {
                    console.error(`Error adding tag ${tagId} for asset ${asset.id}:`, error);
                    overallError = (overallError ? overallError + "; " : "") + `Failed to add tag ID ${tagId.substring(0, 8)}`;
                }
            }

            if (overallError) {
                throw new Error(overallError);
            }

            // After DB operations, fetch the completely updated asset to reflect changes
            const { data: refreshedAsset, error: refreshError } = await supabase
                .from('assets')
                .select('*, asset_rooms(rooms(*)), asset_tags(tags(*))') // Fetch all relations
                .eq('id', asset.id)
                .single();

            if (refreshError) throw refreshError;

            if (refreshedAsset) {
                const roomLink = Array.isArray(refreshedAsset.asset_rooms) && refreshedAsset.asset_rooms.length > 0 ? refreshedAsset.asset_rooms[0] : null;
                const finalRoom = roomLink ? roomLink.rooms : null;
                const tagsData = refreshedAsset.asset_tags;
                const finalTags = Array.isArray(tagsData) ? tagsData.map((at: { tags: { id: string, name: string } }) => at.tags).filter(tag => tag !== null && typeof tag === 'object') : [];

                const processedAsset = {
                    ...refreshedAsset,
                    room: finalRoom,
                    tags: finalTags,
                    asset_rooms: undefined,
                    asset_tags: undefined
                } as AssetWithMuxData;

                setAsset(processedAsset); // Update local state
                onAssetUpdate(processedAsset); // Propagate to parent
                setIsEditTagsModalOpen(false);
            } else {
                throw new Error("Failed to refresh asset after tag update.");
            }

        } catch (error: unknown) {
            console.error("Error saving tags:", error);
            setEditTagsError(error instanceof Error ? error.message : "An unexpected error occurred while saving tags.");
        } finally {
            setIsSavingTags(false);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-1">
                <Label>Tags</Label>
                <Button variant="outline" size="sm" onClick={handleOpenEditTagsModal} className="text-xs h-7">
                    Edit Tags
                </Button>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[24px]">
                {asset.tags && asset.tags.length > 0 ? (
                    asset.tags.map(tag => (
                        <Badge key={tag.id} variant="secondary" className="text-xs font-normal">
                            {tag.name}
                        </Badge>
                    ))
                ) : (
                    <p className="text-xs text-muted-foreground italic">No tags assigned</p>
                )}
            </div>

            <Dialog open={isEditTagsModalOpen} onOpenChange={setIsEditTagsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Tags for {asset.name || 'Asset'}</DialogTitle>
                        <DialogDescription>
                            Select tags to assign. Click a tag to add or remove it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-3 max-h-[250px] sm:max-h-[300px] overflow-y-auto pr-2">
                        {availableTags.map(tag => (
                            <Button
                                key={tag.id}
                                variant={pendingTagIds.includes(tag.id) ? "default" : "outline"}
                                onClick={() => handleToggleTagInEditModal(tag.id)}
                                className="w-full justify-start text-xs h-8 truncate"
                                title={tag.name}
                            >
                                {tag.name}
                            </Button>
                        ))}
                    </div>
                    {editTagsError && <p className="text-sm text-red-500 mt-2 px-1 py-1 bg-red-50 border border-red-200 rounded">Error: {editTagsError}</p>}
                    <DialogFooter className="sm:justify-between pt-3">
                        <Button variant="ghost" onClick={() => setIsEditTagsModalOpen(false)} disabled={isSavingTags} className="sm:mr-auto">
                            Cancel
                        </Button>
                        <Button onClick={handleSaveTagsFromEditModal} disabled={isSavingTags} className="min-w-[100px]">
                            {isSavingTags ? (
                                <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : null}
                            {isSavingTags ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
} 