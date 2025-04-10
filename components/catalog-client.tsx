'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Asset } from '@/types/asset';
import { Room } from '@/types/room';
import { Tag } from '@/types/tag';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format'; // Removed formatRelativeDate
import { useDebounce } from 'use-debounce'; // Remember to install: pnpm add use-debounce
import { Filter, ListFilter, X, Search, GripVertical, Trash2, Camera, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

// Define filter and sort types
interface Filters {
    room: string | null;
    valueRange: string | null;
    tags: string[];
    source: ('video' | 'image' | 'item')[]; // Use 'image'
}

type SortOption = 'newest' | 'oldest' | 'value_desc' | 'value_asc' | 'name_asc' | 'name_desc';

interface CatalogClientProps {
    initialItems: Asset[];
    allRooms: Room[];
    allTags: Tag[];
}

const VALUE_RANGES = [
    { label: '< $100', min: 0, max: 99.99 },
    { label: '$100 - $500', min: 100, max: 500 },
    { label: '$500 - $1000', min: 500.01, max: 1000 },
    { label: '> $1000', min: 1000.01, max: Infinity },
];

export default function CatalogClient({ initialItems, allRooms, allTags }: CatalogClientProps) {
    const [isLoading, setIsLoading] = useState(false); // Keep false for now, implement if needed
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
    const [filters, setFilters] = useState<Filters>({
        room: null,
        valueRange: null,
        tags: [],
        source: ['item', 'image', 'video'], // Use 'image'
    });
    const [sortOption, setSortOption] = useState<SortOption>('newest');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    const handleFilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleTagToggle = (tagId: string) => {
        setFilters(prev => {
            const newTags = prev.tags.includes(tagId)
                ? prev.tags.filter(t => t !== tagId)
                : [...prev.tags, tagId];
            return { ...prev, tags: newTags };
        });
    };

    const handleSourceToggle = (sourceType: 'item' | 'image' | 'video') => { // Use 'image'
        setFilters(prev => {
            let newSource = [...prev.source];
            if (prev.source.includes(sourceType)) {
                newSource = prev.source.filter(s => s !== sourceType);
            } else {
                newSource.push(sourceType);
            }
            // Ensure at least one source is selected if toggling off the last one
            if (newSource.length === 0) {
                newSource = ['item', 'image', 'video']; // Reset if empty
            }
            return { ...prev, source: newSource as ('item' | 'image' | 'video')[] };
        });
    };


    const clearFilters = () => {
        setFilters({
            room: null,
            valueRange: null,
            tags: [],
            source: ['item', 'image', 'video'], // Use 'image'
        });
        setSearchTerm('');
    };

    const filteredAndSortedItems = useMemo(() => {
        let items = initialItems;

        // Apply Search
        if (debouncedSearchTerm) {
            const lowerSearch = debouncedSearchTerm.toLowerCase();
            items = items.filter(item =>
                item.name?.toLowerCase().includes(lowerSearch) ||
                item.description?.toLowerCase().includes(lowerSearch) ||
                item.tags?.some((tag: Tag) => tag.name.toLowerCase().includes(lowerSearch)) || // Added Tag type
                item.rooms?.name?.toLowerCase().includes(lowerSearch)
            );
        }

        // Apply Filters
        items = items.filter(item => {
            const roomMatch = !filters.room || item.room_id === filters.room;
            const valueMatch = !filters.valueRange || (
                item.estimated_value !== null && // Ensure value is not null before comparison
                VALUE_RANGES[parseInt(filters.valueRange, 10)].min <= item.estimated_value &&
                item.estimated_value <= VALUE_RANGES[parseInt(filters.valueRange, 10)].max
            );
            const tagMatch = filters.tags.length === 0 || filters.tags.every(tagId => item.tags?.some((t: Tag) => t.id === tagId)); // Added Tag type

            // Source Filter Logic
            let sourceMatch = false;
            if (filters.source.includes('image') && item.media_type === 'image') sourceMatch = true;
            if (filters.source.includes('item') && item.media_type === 'item') sourceMatch = true;
            // Assumption: Items derived from video still have media_type 'item'
            // If a more specific field like `is_source_video` exists and is needed, adjust here.
            if (filters.source.includes('video') && item.media_type === 'item') sourceMatch = true;

            // If filters.source includes all types, it should always match (covers edge cases)
            if (filters.source.length === 3) sourceMatch = true;

            return roomMatch && valueMatch && tagMatch && sourceMatch;
        });

        // Apply Sorting
        // Create a mutable copy for sorting
        let sortedItems = [...items];
        sortedItems.sort((a, b) => {
            switch (sortOption) {
                case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                case 'value_desc': return (b.estimated_value ?? -Infinity) - (a.estimated_value ?? -Infinity); // Handle nulls for descending
                case 'value_asc': return (a.estimated_value ?? Infinity) - (b.estimated_value ?? Infinity);     // Handle nulls for ascending
                case 'name_asc': return (a.name ?? '').localeCompare(b.name ?? '');
                case 'name_desc': return (b.name ?? '').localeCompare(a.name ?? '');
                default: return 0;
            }
        });

        return sortedItems;
    }, [initialItems, debouncedSearchTerm, filters, sortOption]);

    const handleSelectItem = (itemId: string, isSelected: boolean) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(itemId);
            } else {
                newSet.delete(itemId);
            }
            return newSet;
        });
    };

    const handleToggleSelectAll = (checked: boolean | 'indeterminate') => {
        if (checked === true) {
            setSelectedItems(new Set(filteredAndSortedItems.map(item => item.id))); // Select all visible
        } else {
            setSelectedItems(new Set()); // Deselect all
        }
    };

    const handleDeleteSelected = async () => {
        setIsLoading(true);
        console.log("Attempting to delete items:", Array.from(selectedItems));
        try {
            // TODO: Replace with actual API call to delete items
            // Example: const response = await fetch('/api/items/delete-batch', { method: 'POST', body: JSON.stringify({ ids: Array.from(selectedItems) }) });
            // if (!response.ok) throw new Error('Failed to delete');

            // Placeholder success simulation
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

            alert(`(Placeholder) Successfully deleted ${selectedItems.size} items.`);

            // TODO: Refresh data after deletion.
            // This requires either refetching `initialItems` or updating the state directly.
            // For now, we just clear selection and exit mode.
            setSelectedItems(new Set());
            setIsSelectionMode(false);
            // Need mechanism to update `initialItems` prop or trigger refetch in parent

        } catch (error) {
            console.error("Error deleting items:", error);
            alert("Failed to delete items. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Determine top tags for filtering
    const topTags = useMemo(() => {
        const tagCounts: { [key: string]: number } = {};
        initialItems.forEach(item => {
            item.tags?.forEach((tag: Tag) => { // Added Tag type
                tagCounts[tag.id] = (tagCounts[tag.id] || 0) + 1;
            });
        });
        return allTags
            .map(tag => ({ ...tag, count: tagCounts[tag.id] || 0 }))
            .filter(tag => tag.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Show top 5
    }, [initialItems, allTags]);

    const hasActiveFilters = Boolean(filters.room || filters.valueRange || filters.tags.length > 0 || filters.source.length < 3 || !!debouncedSearchTerm);

    // Add a placeholder image if it doesn't exist
    // You should create public/placeholder-image.svg
    // Example simple SVG:
    // <svg xmlns="http://www.w3.org/2000/svg" width="16" height="9" viewBox="0 0 16 9" fill="none"><rect width="16" height="9" fill="#E5E7EB"/></svg>

    return (
        <div className="container mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-6">Item Catalog</h1>

            {/* Controls Row */}
            <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
                {/* Search */}
                <div className="relative w-full md:flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search items by name, description, tag, room..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-full"
                        disabled={isLoading} // Disable inputs while loading/deleting
                    />
                </div>

                {/* Sort Dropdown */}
                <Select value={sortOption} onValueChange={(value: string) => setSortOption(value as SortOption)} disabled={isLoading}>
                    <SelectTrigger className="w-full md:w-[180px]">
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        <SelectItem value="value_desc">Highest Value</SelectItem>
                        <SelectItem value="value_asc">Lowest Value</SelectItem>
                        <SelectItem value="name_asc">A-Z</SelectItem>
                        <SelectItem value="name_desc">Z-A</SelectItem>
                    </SelectContent>
                </Select>

                {/* Selection Mode Toggle */}
                <Button
                    variant={isSelectionMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                        if (isLoading) return; // Prevent toggling during load
                        setIsSelectionMode(!isSelectionMode);
                        if (isSelectionMode) setSelectedItems(new Set());
                    }}
                    className="w-full md:w-auto"
                    disabled={isLoading}
                >
                    {isSelectionMode ? "Cancel Selection" : "Select Items"}
                </Button>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap gap-2 mb-6 items-center bg-muted p-3 rounded-lg relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-background/50 z-20 flex items-center justify-center">
                        {/* Optional: Add a spinner here */}
                    </div>
                )}
                <span className="font-semibold mr-2 flex items-center"><ListFilter className="h-4 w-4 mr-1" /> Filters:</span>

                {/* Room Filter */}
                <Select
                    value={filters.room ?? "all"}
                    onValueChange={(value: string) => handleFilterChange('room', value === "all" ? null : value)}
                    disabled={isLoading}
                >
                    <SelectTrigger className="w-full sm:w-[150px] h-8 text-xs">
                        <SelectValue placeholder="Room" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Rooms</SelectItem>
                        {allRooms.map(room => (
                            <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Value Filter */}
                <Select
                    value={filters.valueRange ?? "all"}
                    onValueChange={(value: string) => handleFilterChange('valueRange', value === "all" ? null : value)}
                    disabled={isLoading}
                >
                    <SelectTrigger className="w-full sm:w-[150px] h-8 text-xs">
                        <SelectValue placeholder="Value" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any Value</SelectItem>
                        {VALUE_RANGES.map((range, index) => (
                            <SelectItem key={index} value={index.toString()}>{range.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Source Filter Buttons */}
                <div className="flex gap-1 items-center ml-auto sm:ml-0">
                    <span className="text-xs font-medium mr-1">Source:</span>
                    <Button
                        variant={filters.source.includes('video') ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleSourceToggle('video')}
                        disabled={isLoading}
                    >
                        <Video className="h-3 w-3 mr-1" /> Video-Item
                    </Button>
                    <Button
                        variant={filters.source.includes('image') ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleSourceToggle('image')}
                        disabled={isLoading}
                    >
                        <Camera className="h-3 w-3 mr-1" /> Image
                    </Button>
                </div>

                {/* Top Tag Filters */}
                <div className="flex flex-wrap gap-1 items-center mt-2 sm:mt-0">
                    <span className="text-xs font-medium mr-1">Tags:</span>
                    {topTags.map(tag => (
                        <Button
                            key={tag.id}
                            variant={filters.tags.includes(tag.id) ? "secondary" : "outline"}
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => handleTagToggle(tag.id)}
                            disabled={isLoading}
                        >
                            {tag.name}
                        </Button>
                    ))}
                    {/* TODO: Add 'More Tags' button/modal if allTags.length > topTags.length */}
                </div>

                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto text-xs h-8" disabled={isLoading}>
                        <X className="h-3 w-3 mr-1" /> Clear All
                    </Button>
                )}
            </div>

            {/* Selection Actions Bar (Visible in Selection Mode) */}
            {isSelectionMode && selectedItems.size > 0 && (
                <div className="bg-primary text-primary-foreground p-3 rounded-lg mb-6 flex items-center justify-between sticky top-16 md:top-0 z-10 shadow-md">
                    {/* Adjusted sticky top for potential nav bar height */}
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="select-all"
                            checked={filteredAndSortedItems.length > 0 && selectedItems.size === filteredAndSortedItems.length}
                            onCheckedChange={handleToggleSelectAll}
                            aria-label="Select all items"
                            className="border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                            disabled={isLoading}
                        />
                        <label htmlFor='select-all' className="text-sm font-medium">
                            {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                        </label>
                    </div>
                    <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={isLoading}>
                        {isLoading ? "Deleting..." : <><Trash2 className="h-4 w-4 mr-1" /> Delete Selected</>}
                    </Button>
                </div>
            )}

            {/* Item Grid */}
            {/* Render Skeleton only initially or during specific loading phases */}
            {/* Currently `isLoading` is tied to delete action, adjust if needed for initial load */}
            {initialItems.length === 0 && !isLoading ? (
                <EmptyState searchTerm={debouncedSearchTerm} hasFilters={hasActiveFilters} />
            ) : filteredAndSortedItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredAndSortedItems.map((item) => (
                        <ItemCard
                            key={item.id}
                            item={item}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedItems.has(item.id)}
                            onSelect={handleSelectItem}
                            isLoading={isLoading} // Pass loading state to disable interactions
                        />
                    ))}
                </div>
            ) : !isLoading ? ( // Show empty state if filters/search yield no results (and not loading)
                <EmptyState searchTerm={debouncedSearchTerm} hasFilters={hasActiveFilters} />
            ) : (
                <CatalogGridSkeleton /> // Show skeleton while loading (e.g., initial load if implemented)
            )}
        </div>
    );
}

// ----- Helper Components -----

interface ItemCardProps {
    item: Asset;
    isSelectionMode: boolean;
    isSelected: boolean;
    onSelect: (itemId: string, isSelected: boolean) => void;
    isLoading: boolean; // Added loading prop
}

function ItemCard({ item, isSelectionMode, isSelected, onSelect, isLoading }: ItemCardProps) {
    const handleCheckboxChange = (checked: boolean | 'indeterminate') => {
        if (typeof checked === 'boolean' && !isLoading) {
            onSelect(item.id, checked);
        }
    };

    const handleCardClick = () => {
        // Allow selection by clicking card only when in selection mode
        if (isSelectionMode && !isLoading) {
            onSelect(item.id, !isSelected);
        }
        // Navigation is handled by the Link component wrapper below when not in selection mode
    };

    // Use media_url, provide placeholder
    const imageSrc = item.media_url || '/placeholder-image.svg';
    const isVideoDerived = item.media_type === 'item'; // Item derived from video
    const isImage = item.media_type === 'image'; // Standalone image asset

    // Define the content that will be either inside a Link or a div
    const cardInnerContent = (
        <>
            <CardHeader className="p-0 relative">
                <div className="aspect-video relative bg-muted">
                    <Image
                        src={imageSrc}
                        alt={item.name || 'Inventory item'}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => e.currentTarget.src = '/placeholder-image.svg'} // Fallback + type
                    />
                    {/* Source Icon */}
                    <div className="absolute bottom-1 right-1 bg-background/70 rounded-full p-1">
                        {isVideoDerived && <Video className="h-3 w-3 text-muted-foreground" />}
                        {isImage && <Camera className="h-3 w-3 text-muted-foreground" />}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-3">
                <CardTitle className="text-base font-semibold mb-1 truncate" title={item.name || 'Untitled Item'}>
                    {item.name || 'Untitled Item'}
                </CardTitle>
                <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                    <span>{formatCurrency(item.estimated_value)}</span>
                    {item.rooms && <span className="truncate" title={item.rooms.name}>{item.rooms.name}</span>}
                </div>
                {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.slice(0, 3).map((tag: Tag) => (
                            <Badge key={tag.id} variant="secondary" className="text-xs px-1.5 py-0.5">{tag.name}</Badge>
                        ))}
                        {item.tags.length > 3 && <Badge variant="outline" className="text-xs px-1.5 py-0.5">+{item.tags.length - 3}</Badge>}
                    </div>
                )}
            </CardContent>
        </>
    );

    return (
        <Card
            className={cn(
                "overflow-hidden relative transition-all",
                isSelectionMode && "cursor-pointer",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                isLoading && "opacity-50 pointer-events-none"
            )}
            // Apply click handler directly to the Card
            onClick={handleCardClick}
        >
            {isSelectionMode && (
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={handleCheckboxChange}
                    className="absolute top-2 right-2 z-10 bg-background/80 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-5 w-5"
                    aria-label={`Select ${item.name}`}
                    // Stop propagation to prevent card click when clicking checkbox
                    onClick={(e: React.MouseEvent) => e.stopPropagation()} // Added type
                    disabled={isLoading}
                />
            )}

            {/* Conditionally wrap content with Link or use a div */}
            {!isSelectionMode && !isLoading ? (
                <Link href={`/items/${item.id}`} className="block hover:bg-muted/50 transition-colors" passHref legacyBehavior>
                    {/* Content is placed inside the Link for navigation */}
                    {/* Adding legacyBehavior and passHref helps with nesting issues */}
                    {/* Wrap cardInnerContent in a simple element like div or span if Link needs a single child */}
                    <div>{cardInnerContent}</div>
                </Link>
            ) : (
                // If in selection mode or loading, render content directly in a div
                <div className="block">
                    {cardInnerContent}
                </div>
            )}
        </Card>
    );
}

function CatalogGridSkeleton() {
    // Using index as key for skeleton is acceptable as the structure is static
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
                <Card key={`skeleton-${i}`}>
                    <CardHeader className="p-0">
                        <Skeleton className="aspect-video w-full" />
                    </CardHeader>
                    <CardContent className="p-3">
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2 mb-3" />
                        <div className="flex gap-1">
                            <Skeleton className="h-5 w-10 rounded-full" />
                            <Skeleton className="h-5 w-12 rounded-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function EmptyState({ searchTerm, hasFilters }: { searchTerm: string; hasFilters: boolean }) {
    let message = "You haven't documented any items yet.";
    let subMessage = "Start by capturing photos or videos of your belongings.";

    if (searchTerm) {
        message = `No items found matching "${searchTerm}".`;
        subMessage = "Try using different keywords or clearing the search.";
    } else if (hasFilters) {
        message = "No items match your current filters.";
        subMessage = "Try adjusting or clearing the filters to see more items.";
    }

    return (
        <div className="text-center py-16 px-4 border border-dashed rounded-lg bg-muted/50">
            <GripVertical className="mx-auto h-10 w-10 mb-3 text-muted-foreground opacity-70" />
            <p className="text-lg font-semibold text-foreground mb-1">{message}</p>
            <p className="text-sm text-muted-foreground">{subMessage}</p>
            {/* Optionally add a button to clear filters or add new item here */}
            {/* Example: <Button size="sm" variant="outline" className="mt-4">Clear Filters</Button> */}
        </div>
    );
} 