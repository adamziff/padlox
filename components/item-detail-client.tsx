'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Asset } from '@/types/asset';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ArrowLeft, Edit, Trash2, Video, Camera, MapPin, Tag as TagIcon, Save, X as CancelIcon, Calendar, CircleDollarSign, Hash, ShieldCheck } from 'lucide-react';
import { MuxPlayer } from '@/components/mux-player'; // Use named import
import { createClient } from '@/utils/supabase/client';

interface ItemDetailClientProps {
    item: Asset;
    relatedItems: Asset[];
}

export default function ItemDetailClient({ item: initialItem, relatedItems }: ItemDetailClientProps) {
    const router = useRouter();
    const supabase = createClient();
    const [item, setItem] = useState<Asset>(initialItem);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // State for editable fields
    const [name, setName] = useState(item.name || '');
    const [description, setDescription] = useState(item.description || '');
    const [estimatedValue, setEstimatedValue] = useState<string>(item.estimated_value?.toString() || '');
    // TODO: Add state for other editable fields (brand, model, condition, purchase_date, etc.)

    const isVideoItem = item.media_type === 'item' && item.is_source_video && item.mux_playback_id;
    const isImageItem = item.media_type === 'image';

    const handleEditToggle = () => {
        if (isEditing) {
            // Reset fields if cancelling edit
            setName(item.name || '');
            setDescription(item.description || '');
            setEstimatedValue(item.estimated_value?.toString() || '');
            // TODO: Reset other fields
        }
        setIsEditing(!isEditing);
    };

    const handleSaveChanges = async () => {
        setIsLoading(true);
        const value = parseFloat(estimatedValue);

        const updates: Partial<Asset> = {
            name: name,
            description: description,
            estimated_value: isNaN(value) ? null : value,
            // TODO: Include other updated fields
        };

        try {
            const { data, error } = await supabase
                .from('assets')
                .update(updates)
                .eq('id', item.id)
                .select('*, rooms(*), tags(*)') // Re-select necessary fields after update
                .single();

            if (error) throw error;
            if (!data) throw new Error("Update failed, no data returned.");

            setItem(data as Asset); // Update local state with the saved data
            setIsEditing(false);
            // TODO: Add success toast/message
        } catch (error) {
            console.error("Error updating item:", error);
            // TODO: Add error toast/message
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        setIsDeleting(true);
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('assets')
                .delete()
                .eq('id', item.id);

            if (error) throw error;

            // TODO: Add success toast/message
            router.push('/catalog?message=Item deleted successfully'); // Redirect after delete
        } catch (error) {
            console.error("Error deleting item:", error);
            // TODO: Add error toast/message
            setIsDeleting(false); // Close dialog on error
        } finally {
            setIsLoading(false); // This might run before router push completes, maybe remove?
        }
    };

    // Format detail items for display
    const detailItems = [
        { icon: Calendar, label: "Purchase Date", value: item.purchase_date ? new Date(item.purchase_date).toLocaleDateString() : null },
        { icon: CircleDollarSign, label: "Purchase Price", value: formatCurrency(item.purchase_price) },
        { icon: ShieldCheck, label: "Condition", value: item.condition },
        { icon: Hash, label: "Serial Number", value: item.serial_number },
        // Add Brand, Model etc.
    ].filter(detail => detail.value);

    return (
        <div className="container mx-auto px-4 py-6">
            {/* Back Button & Actions */}
            <div className="flex justify-between items-center mb-4">
                <Button variant="outline" size="sm" onClick={() => router.back()} disabled={isLoading}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Catalog
                </Button>
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <>
                            <Button variant="ghost" size="sm" onClick={handleEditToggle} disabled={isLoading}>
                                <CancelIcon className="h-4 w-4 mr-2" /> Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveChanges} disabled={isLoading}>
                                <Save className="h-4 w-4 mr-2" /> {isLoading ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" size="sm" onClick={handleEditToggle} disabled={isLoading}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                        </Button>
                    )}
                    <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isLoading || isEditing}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the item \
                                    <span className="font-semibold">{item.name || 'this item'}</span>.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteConfirm} disabled={isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {isLoading ? 'Deleting...' : 'Yes, delete item'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area (Details & Media) */}
                <div className="lg:col-span-2">
                    {/* Header Section */}
                    <div className="mb-6 border-b pb-4">
                        {isEditing ? (
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Item Name"
                                className="text-3xl font-bold mb-2 h-auto p-0 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                disabled={isLoading}
                            />
                        ) : (
                            <h1 className="text-3xl font-bold mb-2" title={item.name || 'Untitled Item'}>{item.name || 'Untitled Item'}</h1>
                        )}
                        {isEditing ? (
                            <Input
                                value={estimatedValue}
                                onChange={(e) => setEstimatedValue(e.target.value)}
                                type="number"
                                placeholder="Estimated Value"
                                className="text-xl text-muted-foreground font-semibold h-auto p-0 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 w-1/4"
                                disabled={isLoading}
                            />
                        ) : (
                            <p className="text-xl text-muted-foreground font-semibold">{formatCurrency(item.estimated_value)}</p>
                        )}
                        {/* TODO: Add Brand/Model/Condition here */}
                    </div>

                    {/* Media Display Section */}
                    <div className="mb-8 relative">
                        {isVideoItem ? (
                            <>
                                <MuxPlayer
                                    playbackId={item.mux_playback_id!}
                                    startTime={item.item_timestamp ?? 0}
                                    className="aspect-video w-full rounded-lg overflow-hidden mb-2 shadow-md"
                                // Pass other necessary props like metadata, controls config etc.
                                />
                                {/* Placeholder for Custom Timestamp Scrubber */}
                                <div className="bg-muted rounded p-2 mt-2 text-center text-sm text-muted-foreground">
                                    Custom Timestamp Scrubber Area (Timestamp: {item.item_timestamp?.toFixed(2)}s)
                                </div>
                            </>
                        ) : isImageItem ? (
                            <div className="aspect-video w-full relative rounded-lg overflow-hidden shadow-md bg-muted">
                                <Image
                                    src={item.media_url || '/placeholder-image.svg'}
                                    alt={item.name || 'Item image'}
                                    fill
                                    className="object-contain" // Use contain for single images?
                                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => e.currentTarget.src = '/placeholder-image.svg'}
                                />
                            </div>
                        ) : (
                            <div className="aspect-video w-full relative rounded-lg overflow-hidden shadow-md bg-muted flex items-center justify-center">
                                <Camera className="h-16 w-16 text-muted-foreground/50" /> {/* Fallback Icon */}
                            </div>
                        )}
                    </div>

                    {/* Description Section */}
                    <div className="mb-8">
                        <h2 className="text-xl font-semibold mb-3">Description</h2>
                        {isEditing ? (
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Enter item description..."
                                className="min-h-[100px]"
                                disabled={isLoading}
                            />
                        ) : (
                            <p className="text-muted-foreground whitespace-pre-wrap">{item.description || 'No description provided.'}</p>
                        )}
                    </div>
                </div>

                {/* Sidebar Area (Details, Tags, Room) */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Details Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            {isEditing ? (
                                <>
                                    {/* TODO: Add editable fields for details like Purchase Date, Price, Condition, SN etc. */}
                                    <p className="text-muted-foreground text-xs">(Detail editing not fully implemented yet)</p>
                                </>
                            ) : detailItems.length > 0 ? (
                                detailItems.map((detail, index) => (
                                    <div key={index} className="flex items-center">
                                        <detail.icon className="h-4 w-4 mr-3 text-muted-foreground" />
                                        <span className="font-medium mr-2">{detail.label}:</span>
                                        <span className="text-muted-foreground truncate" title={detail.value!}>{detail.value}</span>
                                    </div>
                                )))
                                : (
                                    <p className="text-muted-foreground italic">No additional details available.</p>
                                )
                            }
                        </CardContent>
                    </Card>

                    {/* Room Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center">
                                <MapPin className="h-5 w-5 mr-2" /> Room
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isEditing ? (
                                <>
                                    {/* TODO: Implement Room Select Dropdown */}
                                    <p className="text-muted-foreground text-sm">(Room selection coming soon)</p>
                                </>
                            ) : item.rooms ? (
                                // TODO: Make this a Link to a room detail page later
                                <Badge variant="outline" className="text-base px-3 py-1 cursor-pointer hover:bg-accent">
                                    {item.rooms.name}
                                </Badge>
                            ) : (
                                <p className="text-muted-foreground italic">No room assigned.</p>
                            )
                            }
                        </CardContent>
                    </Card>

                    {/* Tags Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center">
                                <TagIcon className="h-5 w-5 mr-2" /> Tags
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isEditing ? (
                                <>
                                    {/* TODO: Implement Tag Input/Selection */}
                                    <p className="text-muted-foreground text-sm">(Tag editing coming soon)</p>
                                </>
                            ) : item.tags && item.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {item.tags.map(tag => (
                                        // TODO: Make these filter catalog on click
                                        <Badge key={tag.id} variant="secondary" className="cursor-pointer hover:bg-primary/20">
                                            {tag.name}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground italic">No tags assigned.</p>
                            )
                            }
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Related Items Section */}
            {relatedItems.length > 0 && (
                <div className="mt-12 border-t pt-8">
                    <h2 className="text-xl font-semibold mb-4">Related Items in {item.rooms?.name || 'This Room'}</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {relatedItems.map(related => (
                            // Using a simplified card structure here
                            <Link key={related.id} href={`/items/${related.id}`} className="block group">
                                <Card className="overflow-hidden h-full transition-shadow hover:shadow-md">
                                    <div className="aspect-square relative bg-muted">
                                        <Image
                                            src={related.media_url || '/placeholder-image.svg'}
                                            alt={related.name || 'Related item'}
                                            fill
                                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                                            className="object-cover transition-transform group-hover:scale-105"
                                            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => e.currentTarget.src = '/placeholder-image.svg'}
                                        />
                                    </div>
                                    <CardContent className="p-2">
                                        <p className="text-sm font-medium truncate" title={related.name || 'Untitled'}>{related.name || 'Untitled'}</p>
                                        <p className="text-xs text-muted-foreground">{formatCurrency(related.estimated_value)}</p>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                    {/* TODO: Add "View More" link if applicable */}
                </div>
            )}
        </div>
    );
} 