'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface Tag {
    id: string;
    name: string;
}

interface BulkTagManagementModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    availableTags: Tag[];
    selectedAssetIds: string[];
    getTagStatus: (tagId: string) => 'all' | 'some' | 'none';
    onComplete?: () => void; // Called when changes are saved
    disabled?: boolean;
}

export function BulkTagManagementModal({
    isOpen,
    onOpenChange,
    availableTags,
    selectedAssetIds,
    getTagStatus,
    onComplete,
    disabled = false
}: BulkTagManagementModalProps) {
    const supabase = createClient();
    const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize pending tags when modal opens
    useEffect(() => {
        if (isOpen) {
            // Start with tags that ALL selected assets have
            const allTags = availableTags.filter(tag => getTagStatus(tag.id) === 'all');
            setPendingTagIds(allTags.map(tag => tag.id));
            setError(null);
        }
    }, [isOpen, availableTags, getTagStatus]);

    const handleToggleTag = (tagId: string) => {
        setPendingTagIds(prev =>
            prev.includes(tagId)
                ? prev.filter(id => id !== tagId)
                : [...prev, tagId]
        );
    };

    const handleSave = async () => {
        if (selectedAssetIds.length === 0) return;

        setIsSaving(true);
        setError(null);

        try {
            // For each selected asset, update its tags to match pendingTagIds
            for (const assetId of selectedAssetIds) {
                // First, remove all existing tags for this asset
                const { error: deleteError } = await supabase
                    .from('asset_tags')
                    .delete()
                    .eq('asset_id', assetId);

                if (deleteError) {
                    console.error(`Error removing tags for asset ${assetId}:`, deleteError);
                    throw new Error(`Failed to remove existing tags for asset ${assetId.substring(0, 8)}`);
                }

                // Then, add the new tags
                if (pendingTagIds.length > 0) {
                    const tagInserts = pendingTagIds.map(tagId => ({
                        asset_id: assetId,
                        tag_id: tagId
                    }));

                    const { error: insertError } = await supabase
                        .from('asset_tags')
                        .insert(tagInserts);

                    if (insertError) {
                        console.error(`Error adding tags for asset ${assetId}:`, insertError);
                        throw new Error(`Failed to add tags for asset ${assetId.substring(0, 8)}`);
                    }
                }
            }

            // Close modal and notify completion
            onOpenChange(false);
            onComplete?.();

        } catch (error: unknown) {
            console.error('Error saving bulk tags:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred while saving tags.');
        } finally {
            setIsSaving(false);
        }
    };

    const getTagButtonVariant = (tagId: string) => {
        if (pendingTagIds.includes(tagId)) {
            return 'default';
        }
        return 'outline';
    };

    const showCheckIcon = (tagId: string) => {
        return pendingTagIds.includes(tagId);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Manage Tags for {selectedAssetIds.length} Assets</DialogTitle>
                    <DialogDescription>
                        Select tags to add or remove. Click a tag to toggle it for all selected assets.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-3 max-h-[250px] sm:max-h-[300px] overflow-y-auto pr-2">
                    {availableTags.map(tag => (
                        <Button
                            key={tag.id}
                            variant={getTagButtonVariant(tag.id)}
                            onClick={() => handleToggleTag(tag.id)}
                            className="w-full justify-start text-xs h-8 truncate relative"
                            title={tag.name}
                            disabled={disabled || isSaving}
                        >
                            <span className="truncate">{tag.name}</span>
                            {showCheckIcon(tag.id) && (
                                <Check className="h-3 w-3 ml-auto flex-shrink-0" />
                            )}
                        </Button>
                    ))}
                </div>

                {/* Status indicators */}
                <div className="text-xs text-muted-foreground space-y-1 py-2 border-t">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-primary rounded-sm flex items-center justify-center">
                            <Check className="h-2 w-2 text-primary-foreground" />
                        </div>
                        <span>All selected assets will have this tag</span>
                    </div>
                </div>

                {error && (
                    <p className="text-sm text-red-500 mt-2 px-2 py-1 bg-red-50 border border-red-200 rounded">
                        Error: {error}
                    </p>
                )}

                <DialogFooter className="sm:justify-between pt-3">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving}
                        className="sm:mr-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || disabled}
                        className="min-w-[100px]"
                    >
                        {isSaving ? (
                            <>
                                <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 