'use client'

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AssetWithMuxData } from '@/types/mux';
import { createClient } from '@/utils/supabase/client';
import { useDebouncedCallback } from 'use-debounce';

interface AssetDetailsFormProps {
    asset: AssetWithMuxData;
    onAssetUpdate: (updatedAsset: AssetWithMuxData) => void;
    // Add any other props needed, e.g., for displaying save status from parent if not handled internally
}

export function AssetDetailsForm({
    asset: initialAsset, // Use initialAsset to avoid confusion with internal state
    onAssetUpdate
}: AssetDetailsFormProps) {
    const supabase = createClient();
    const [asset, setAsset] = useState<AssetWithMuxData>(initialAsset);

    const [editableName, setEditableName] = useState(initialAsset.name || '');
    const [editableDescription, setEditableDescription] = useState(initialAsset.description || '');
    const [editableValue, setEditableValue] = useState<string>(
        initialAsset.estimated_value != null ? String(initialAsset.estimated_value) : ''
    );

    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Update local state if the initialAsset prop changes (e.g., due to realtime updates from parent)
    useEffect(() => {
        setAsset(initialAsset);
        setEditableName(initialAsset.name || '');
        setEditableDescription(initialAsset.description || '');
        setEditableValue(initialAsset.estimated_value != null ? String(initialAsset.estimated_value) : '');
    }, [initialAsset]);

    const debouncedSave = useDebouncedCallback(async () => {
        if (!editableName.trim()) {
            setSaveError('Name cannot be empty.');
            // Potentially revert to asset.name or initialAsset.name if you want to prevent saving an empty name
            // For now, just show error and don't proceed with DB update for empty name.
            return;
        }
        const valueToSave = editableValue.trim() === '' ? null : parseFloat(editableValue);
        if (editableValue.trim() !== '' && (isNaN(valueToSave!) || valueToSave! < 0)) {
            setSaveError('Invalid estimated value. Must be a non-negative number.');
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        const updates = {
            name: editableName.trim(),
            description: editableDescription.trim() || null,
            estimated_value: valueToSave,
        };

        try {
            const { data: updatedDbAsset, error } = await supabase
                .from('assets')
                .update(updates)
                .eq('id', asset.id)
                .select('*, asset_rooms(rooms(*)), asset_tags(tags(*))') // Re-fetch relations for consistency
                .single();

            if (error) throw error;

            if (updatedDbAsset) {
                // Process relations as done in dashboard/useDashboardLogic
                const roomLink = Array.isArray(updatedDbAsset.asset_rooms) && updatedDbAsset.asset_rooms.length > 0 ? updatedDbAsset.asset_rooms[0] : null;
                const finalRoom = roomLink ? roomLink.rooms : null;
                const tagsData = updatedDbAsset.asset_tags;
                const finalTags = Array.isArray(tagsData) ? tagsData.map((at: { tags: { id: string, name: string } }) => at.tags).filter(tag => tag !== null && typeof tag === 'object') : [];

                const processedAsset = {
                    ...updatedDbAsset,
                    room: finalRoom,
                    tags: finalTags,
                    asset_rooms: undefined, // Clean up join table data
                    asset_tags: undefined,
                } as AssetWithMuxData;

                setAsset(processedAsset); // Update internal state for this component
                onAssetUpdate(processedAsset); // Propagate fully updated asset to parent
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
            } else {
                throw new Error("Asset update returned no data.");
            }
        } catch (error: unknown) {
            console.error('Error saving asset details:', error);
            setSaveError(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Optionally revert changes on error:
            // setEditableName(asset.name || '');
            // setEditableDescription(asset.description || '');
            // setEditableValue(asset.estimated_value != null ? String(asset.estimated_value) : '');
        } finally {
            setIsSaving(false);
        }
    }, 750); // Debounce time

    // Trigger debouncedSave when editable fields change
    useEffect(() => {
        // Only call save if there's an actual change from the current asset state
        // This prevents saving on initial load if initialAsset already matches editable fields
        if (editableName !== (asset.name || '') ||
            editableDescription !== (asset.description || '') ||
            (editableValue.trim() === '' ? null : parseFloat(editableValue)) !== (asset.estimated_value ?? null) ||
            // Handle case where initial value might be null/undefined and input is empty string
            (asset.estimated_value == null && editableValue.trim() !== '') ||
            (asset.estimated_value != null && editableValue !== String(asset.estimated_value))
        ) {
            if (editableName.trim()) { // Basic validation before triggering save
                debouncedSave();
            } else if (asset.name) { // If name became empty, show error immediately
                setSaveError('Name cannot be empty.');
            }
        }
    }, [editableName, editableDescription, editableValue, asset, debouncedSave]);

    return (
        <div className="space-y-4">
            <div>
                <Label htmlFor={`asset-name-${asset.id}`}>Name</Label>
                <Input
                    id={`asset-name-${asset.id}`}
                    value={editableName}
                    onChange={(e) => setEditableName(e.target.value)}
                    placeholder="Enter asset name"
                    className="mt-1"
                />
            </div>
            <div>
                <Label htmlFor={`asset-description-${asset.id}`}>Description</Label>
                <Textarea
                    id={`asset-description-${asset.id}`}
                    value={editableDescription}
                    onChange={(e) => setEditableDescription(e.target.value)}
                    placeholder="Enter asset description (optional)"
                    className="mt-1"
                    rows={3}
                />
            </div>
            <div>
                <Label htmlFor={`asset-value-${asset.id}`}>Estimated Value ($)</Label>
                <Input
                    id={`asset-value-${asset.id}`}
                    type="number"
                    value={editableValue}
                    onChange={(e) => setEditableValue(e.target.value)}
                    placeholder="e.g., 150.00"
                    className="mt-1"
                />
            </div>
            {isSaving && <p className="text-sm text-muted-foreground">Saving...</p>}
            {saveSuccess && <p className="text-sm text-green-600">Saved!</p>}
            {saveError && <p className="text-sm text-red-500">Error: {saveError}</p>}
        </div>
    );
} 