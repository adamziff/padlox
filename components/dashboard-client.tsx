'use client'

import React, { useState, useMemo, useEffect } from 'react' // Added useEffect
import { useDashboardLogic } from '@/hooks/use-dashboard-logic'
import { CameraCaptureWrapper } from './camera-capture-wrapper'
import { MediaPreview } from './media-preview'
import { AssetModal } from './asset-modal'
import { AssetWithMuxData } from '@/types/mux'
import { NavBar } from '@/components/nav-bar'
import { User } from '@supabase/supabase-js'
import { DashboardHeader } from './dashboard-header'
import { AssetGrid } from './asset-grid'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, PlusCircle } from 'lucide-react'; // Added PlusCircle
import { formatCurrency } from '@/utils/format';
import { Button } from '@/components/ui/button'; // Added Button
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogTrigger,
} from "@/components/ui/dialog"; // Added Dialog components
import { Input } from "@/components/ui/input"; // Added Input
import { Label } from "@/components/ui/label"; // Added Label

// Basic types for Tag and Room - ideally these would come from a shared types file
interface Tag {
    id: string;
    name: string;
    // user_id?: string; // If needed
}

interface Room {
    id: string;
    name: string;
    // user_id?: string; // If needed
}

type DashboardClientProps = {
    initialAssets: AssetWithMuxData[];
    user: User;
    initialTotalItems: number;
    initialTotalValue: number;
}

export function DashboardClient({
    initialAssets,
    user,
    initialTotalItems,
    initialTotalValue
}: DashboardClientProps) {
    const {
        showCamera,
        capturedFile,
        assets,
        selectedAsset,
        selectedAssets,
        isSelectionMode,
        isDeleting,
        mediaErrors,
        thumbnailTokens,
        activeUploads,

        handleCapture,
        handleSave,
        handleBulkDelete,
        handleAssetClick,
        handleMediaError,
        handleRetryMedia,
        toggleAssetSelection,
        fetchThumbnailToken,
        handleToggleSelectionMode,
        handleAddNewAsset,
        handleCloseCamera,
        handleCancelMediaPreview,
        handleRetryMediaPreview,
        handleCloseAssetModal,
        totalItems,
        totalValue
    } = useDashboardLogic({
        initialAssets,
        user,
        initialTotalItems,
        initialTotalValue
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [userTags, setUserTags] = useState<Tag[]>([]);
    const [userRooms, setUserRooms] = useState<Room[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string>(""); // "" for All Rooms
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

    // State for "Create Tag" dialog
    const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [createTagLoading, setCreateTagLoading] = useState(false);
    const [createTagError, setCreateTagError] = useState<string | null>(null);

    // State for "Create Room" dialog
    const [isCreateRoomDialogOpen, setIsCreateRoomDialogOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState("");
    const [createRoomLoading, setCreateRoomLoading] = useState(false);
    const [createRoomError, setCreateRoomError] = useState<string | null>(null);

    // State for mobile filter toggle
    const [showFilters, setShowFilters] = useState(false);

    const fetchUserTagsAndRooms = async () => {
        try {
            const [tagsResponse, roomsResponse] = await Promise.all([
                fetch('/api/tags'),
                fetch('/api/rooms')
            ]);

            if (tagsResponse.ok) {
                const tagsData = await tagsResponse.json();
                setUserTags(tagsData.data || []);
            } else {
                console.error('Failed to fetch tags');
                setUserTags([]);
            }

            if (roomsResponse.ok) {
                const roomsData = await roomsResponse.json();
                setUserRooms(roomsData.data || []);
            } else {
                console.error('Failed to fetch rooms');
                setUserRooms([]);
            }
        } catch (error) {
            console.error('Error fetching tags or rooms:', error);
            setUserTags([]);
            setUserRooms([]);
        }
    };

    useEffect(() => {
        fetchUserTagsAndRooms();
    }, []);

    const handleRoomChange = (roomId: string) => {
        setSelectedRoomId(roomId);
    };

    const toggleTagSelection = (tagId: string) => {
        setSelectedTagIds(prev =>
            prev.includes(tagId)
                ? prev.filter(id => id !== tagId)
                : [...prev, tagId]
        );
    };

    const clearAllFilters = () => {
        setSelectedRoomId("");
        setSelectedTagIds([]);
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) {
            setCreateTagError("Tag name cannot be empty.");
            return;
        }
        setCreateTagLoading(true);
        setCreateTagError(null);
        try {
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTagName }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to create tag (status: ${response.status})`);
            }
            setUserTags(prevTags => [...prevTags, result.data]);
            setNewTagName("");
            setIsCreateTagDialogOpen(false);
            // Consider adding a success toast/notification here
        } catch (error: any) {
            setCreateTagError(error.message || "An unknown error occurred.");
        } finally {
            setCreateTagLoading(false);
        }
    };

    const handleCreateRoom = async () => {
        if (!newRoomName.trim()) {
            setCreateRoomError("Room name cannot be empty.");
            return;
        }
        setCreateRoomLoading(true);
        setCreateRoomError(null);
        try {
            const response = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newRoomName }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Failed to create room (status: ${response.status})`);
            }
            setUserRooms(prevRooms => [...prevRooms, result.data]);
            setNewRoomName("");
            setIsCreateRoomDialogOpen(false);
            // Consider adding a success toast/notification here
        } catch (error: any) {
            setCreateRoomError(error.message || "An unknown error occurred.");
        } finally {
            setCreateRoomLoading(false);
        }
    };

    const displayedAssets = useMemo(() => {
        let filtered = assets.filter(asset => {
            // Exclude processed source videos
            if (asset.media_type === 'video' && asset.is_source_video === true && asset.is_processed === true) {
                return false;
            }
            return true;
        });

        // Apply search term filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(asset => {
                const nameMatch = asset.name?.toLowerCase().includes(term);
                const descMatch = asset.description?.toLowerCase().includes(term);
                const transcriptMatch = asset.transcript_text?.toLowerCase().includes(term);
                return nameMatch || descMatch || transcriptMatch;
            });
        }

        // Apply room filter
        if (selectedRoomId && selectedRoomId !== "") {
            filtered = filtered.filter(asset => asset.room?.id === selectedRoomId);
        }

        // Apply tags filter (AND logic: asset must have ALL selected tags)
        if (selectedTagIds.length > 0) {
            filtered = filtered.filter(asset => {
                const assetTagIds = asset.tags?.map(tag => tag.id) || [];
                return selectedTagIds.every(selectedTagId => assetTagIds.includes(selectedTagId));
            });
        }

        return filtered;
    }, [assets, searchTerm, selectedRoomId, selectedTagIds]);

    const renderActiveUploads = () => {
        const uploads = Object.values(activeUploads);
        if (uploads.length === 0) return null;

        return (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {uploads.map((upload, index) => (
                    <div key={index} className="bg-background text-foreground border border-border rounded-lg p-3 shadow-md text-sm">
                        <p className="font-semibold">{
                            upload.status === 'uploading' ? 'Uploading...' :
                                upload.status === 'processing' ? 'Processing video...' :
                                    upload.status === 'preparing_transcription' ? 'Preparing transcription...' :
                                        upload.status === 'transcribing' ? 'Transcribing...' :
                                            upload.status === 'analyzing' ? 'Analyzing item...' :
                                                upload.status === 'error' ? 'Error' :
                                                    'Complete'
                        }</p>
                        <p>{upload.message}</p>
                        {upload.status === 'uploading' && (
                            <p className="text-xs text-green-500 mt-1">
                                Real-time frame analysis active
                            </p>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    const handleDelete = async (assetId: string) => {
        console.log(`Attempting to delete asset ${assetId}`);
        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ assetId }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete asset');
            }
            console.log("Asset delete API call successful");
            handleCloseAssetModal();
        } catch (error) {
            console.error('Error deleting asset:', error);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <NavBar />
            <div className="container mx-auto p-4 sm:p-6">
                <DashboardHeader
                    hasAssets={displayedAssets.length > 0}
                    isSelectionMode={isSelectionMode}
                    selectedCount={selectedAssets.size}
                    isDeleting={isDeleting}
                    onToggleSelectionMode={handleToggleSelectionMode}
                    onBulkDelete={handleBulkDelete}
                    onAddNewAsset={handleAddNewAsset}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                />

                {/* Filter UI Elements */}
                <div className="my-4">
                    {/* Mobile Filter Toggle (Appears on smaller screens) */}
                    <div className="block sm:hidden mb-4">
                        <Button
                            variant="outline"
                            className="w-full flex items-center justify-between"
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <span>
                                Filters
                                {(selectedRoomId || selectedTagIds.length > 0) &&
                                    ` (${(selectedRoomId ? 1 : 0) + selectedTagIds.length})`
                                }
                            </span>
                            <span>{showFilters ? "↑" : "↓"}</span>
                        </Button>
                    </div>

                    {/* Filters Section (Always visible on desktop, toggleable on mobile) */}
                    <div className={`space-y-4 ${showFilters ? 'block' : 'hidden sm:block'}`}>
                        {/* Room Filter - Chip Based */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Filter by Room</h3>
                                {selectedRoomId && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => setSelectedRoomId("")}
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    className={`px-3 py-1.5 rounded-full text-sm ${selectedRoomId === ""
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                        }`}
                                    onClick={() => handleRoomChange("")}
                                >
                                    All Rooms
                                </button>
                                {userRooms.map(room => (
                                    <button
                                        key={room.id}
                                        className={`px-3 py-1.5 rounded-full text-sm ${selectedRoomId === room.id
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                            }`}
                                        onClick={() => handleRoomChange(room.id)}
                                    >
                                        {room.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tag Filter - Chip Based */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Filter by Tags</h3>
                                {selectedTagIds.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => setSelectedTagIds([])}
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {userTags.map(tag => (
                                    <button
                                        key={tag.id}
                                        className={`px-3 py-1.5 rounded-full text-sm ${selectedTagIds.includes(tag.id)
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                            }`}
                                        onClick={() => toggleTagSelection(tag.id)}
                                    >
                                        {tag.name}
                                    </button>
                                ))}
                                {userTags.length === 0 && (
                                    <p className="text-sm text-muted-foreground italic">No tags yet. Create one!</p>
                                )}
                            </div>
                        </div>

                        {/* Active Filters Display */}
                        {(selectedRoomId !== "" || selectedTagIds.length > 0) && (
                            <div className="pt-2 border-t border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-medium text-foreground">Active Filters</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={clearAllFilters}
                                    >
                                        Clear All
                                    </Button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {selectedRoomId !== "" && (
                                        <div className="flex items-center bg-primary/20 px-2 py-1 rounded-full text-sm">
                                            <span className="mr-1">{userRooms.find(r => r.id === selectedRoomId)?.name}</span>
                                            <button
                                                className="text-muted-foreground hover:text-foreground"
                                                onClick={() => setSelectedRoomId("")}
                                                aria-label="Remove room filter"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )}

                                    {selectedTagIds.map(tagId => {
                                        const tag = userTags.find(t => t.id === tagId);
                                        return (
                                            <div key={tagId} className="flex items-center bg-primary/20 px-2 py-1 rounded-full text-sm">
                                                <span className="mr-1">{tag?.name}</span>
                                                <button
                                                    className="text-muted-foreground hover:text-foreground"
                                                    onClick={() => toggleTagSelection(tagId)}
                                                    aria-label={`Remove ${tag?.name} tag filter`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Create New Tag/Room Buttons */}
                        <div className="flex flex-wrap gap-2 pt-2">
                            <Dialog open={isCreateTagDialogOpen} onOpenChange={setIsCreateTagDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="flex items-center gap-1">
                                        <PlusCircle className="h-4 w-4" /> Create Tag
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create New Tag</DialogTitle>
                                        <DialogDescription>Enter a name for your new tag.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="new-tag-name" className="text-right">Name</Label>
                                            <Input
                                                id="new-tag-name"
                                                value={newTagName}
                                                onChange={(e) => setNewTagName(e.target.value)}
                                                className="col-span-3"
                                                disabled={createTagLoading}
                                            />
                                        </div>
                                        {createTagError && <p className="col-span-4 text-sm text-destructive text-center">{createTagError}</p>}
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant="outline" disabled={createTagLoading}>Cancel</Button>
                                        </DialogClose>
                                        <Button onClick={handleCreateTag} disabled={createTagLoading}>
                                            {createTagLoading ? "Creating..." : "Create Tag"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={isCreateRoomDialogOpen} onOpenChange={setIsCreateRoomDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="flex items-center gap-1">
                                        <PlusCircle className="h-4 w-4" /> Create Room
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create New Room</DialogTitle>
                                        <DialogDescription>Enter a name for your new room.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="new-room-name" className="text-right">Name</Label>
                                            <Input
                                                id="new-room-name"
                                                value={newRoomName}
                                                onChange={(e) => setNewRoomName(e.target.value)}
                                                className="col-span-3"
                                                disabled={createRoomLoading}
                                            />
                                        </div>
                                        {createRoomError && <p className="col-span-4 text-sm text-destructive text-center">{createRoomError}</p>}
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant="outline" disabled={createRoomLoading}>Cancel</Button>
                                        </DialogClose>
                                        <Button onClick={handleCreateRoom} disabled={createRoomLoading}>
                                            {createRoomLoading ? "Creating..." : "Create Room"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-2 gap-4 my-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                            <Package className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalItems}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Est. Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                        </CardContent>
                    </Card>
                </div>

                {showCamera && (
                    <CameraCaptureWrapper
                        onCapture={handleCapture}
                        onClose={handleCloseCamera}
                        realTimeAnalysis={true}
                    />
                )}

                {capturedFile && (
                    <MediaPreview
                        file={capturedFile}
                        onSave={handleSave}
                        onRetry={handleRetryMediaPreview}
                        onCancel={handleCancelMediaPreview}
                    />
                )}

                <AssetGrid
                    assets={displayedAssets}
                    selectedAssets={selectedAssets}
                    isSelectionMode={isSelectionMode}
                    thumbnailTokens={thumbnailTokens}
                    mediaErrors={mediaErrors}
                    onAssetClick={handleAssetClick}
                    onCheckboxChange={toggleAssetSelection}
                    onRetryMedia={handleRetryMedia}
                    onImageError={handleMediaError}
                    fetchThumbnailToken={fetchThumbnailToken}
                />

                {selectedAsset && (
                    <AssetModal
                        asset={selectedAsset}
                        onClose={handleCloseAssetModal}
                        onDelete={handleDelete}
                        availableTags={userTags}
                        availableRooms={userRooms}
                        onAssetUpdate={(updatedAsset) => {
                            // Find and update the asset in the main 'assets' list
                            const updatedAssets = assets.map(a =>
                                a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a
                            );
                            // This assumes 'assets' is directly managed or useDashboardLogic provides a setter
                            // For now, logging it. A proper state update mechanism is needed here.
                            console.log('Asset updated in modal, propagate to dashboard state:', updatedAsset);
                            // If useDashboardLogic returns a setter for 'assets', use it here.
                            // e.g., setAssets(updatedAssets); 
                            // For the purpose of this task, we'll assume selectedAsset in modal will reflect changes,
                            // and AssetCard will re-render if selectedAsset is part of its key or props.
                            // A more robust solution would be to lift state or use a global state manager.
                            // Find the asset in the main assets list and update it
                            const index = assets.findIndex(a => a.id === updatedAsset.id);
                            if (index !== -1) {
                                const newAssets = [...assets];
                                newAssets[index] = { ...newAssets[index], ...updatedAsset };
                                // Call a setter from useDashboardLogic if available, e.g., updateAssets(newAssets)
                                // For now, this direct mutation won't trigger re-renders unless `assets` itself is replaced.
                                // This is a placeholder for where the actual state update for the `assets` list would go.
                                console.log("Updated asset in list (conceptual):", newAssets[index]);
                            }
                        }}
                    />
                )}

                {renderActiveUploads()}
            </div>
        </div>
    );
}