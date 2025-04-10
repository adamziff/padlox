// components/my-home-client.tsx
'use client';

import { Asset } from '@/types/asset';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress"; // Corrected path after install
import { Badge } from "@/components/ui/badge"; // Corrected path after install
import Link from 'next/link';
import Image from 'next/image';
import { Boxes, DraftingCompass, Sofa, TrendingUp, Plus } from 'lucide-react'; // Ensure Boxes is imported
import { formatCurrency } from '@/lib/format'; // Corrected import path

interface MyHomeClientProps {
    recentItems: Asset[];
    totalItems: number;
    totalValue: number;
}

// Placeholder for Item Preview Card (can be same as AssetCard or simplified)
const ItemPreviewCard: React.FC<{ item: Asset }> = ({ item }) => {
    const displayValue = item.estimated_value ? formatCurrency(item.estimated_value) : 'No value';
    // Corrected media_type check
    const imageUrl = item.media_type === 'image' ? item.media_url : null; // Check for 'image'
    const placeholderIcon = <Boxes className="w-16 h-16 text-muted-foreground" />; // Use imported Boxes

    return (
        <Card className="overflow-hidden flex flex-col h-full">
            <CardHeader className="p-0 relative aspect-square flex items-center justify-center bg-muted">
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={item.name ?? 'Item image'}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover"
                        priority={false} // Only prioritize above-the-fold images if needed
                    />
                ) : (
                    placeholderIcon
                )}
            </CardHeader>
            <CardContent className="p-4 flex-grow">
                <p className="font-semibold truncate text-sm">{item.name ?? 'Unnamed Item'}</p>
                <p className="text-xs text-muted-foreground">{displayValue}</p>
            </CardContent>
            {/* Optional: Add CardFooter for actions if needed */}
        </Card>
    );
};

export default function MyHomeClient({ recentItems, totalItems, totalValue }: MyHomeClientProps) {
    const hasItems = recentItems.length > 0 || totalItems > 0;
    const protectionScore = 75; // Static placeholder

    return (
        <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Home</h1>

            {/* Top Section: Score & Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <DraftingCompass className="w-5 h-5" />
                            Protection Score
                        </CardTitle>
                        <CardDescription>An estimate of your coverage.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-2">
                        {/* Using linear progress for simplicity, can replace with circular */}
                        <Progress value={protectionScore} className="w-full h-3" />
                        <p className="text-2xl font-bold">{protectionScore}<span className="text-muted-foreground text-sm">/100</span></p>
                        {/* Link to calculation details (deferred) */}
                        <Button variant="link" size="sm" className="text-xs h-auto p-0">Learn More</Button>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Boxes className="w-5 h-5" />
                            Total Items
                        </CardTitle>
                        <CardDescription>Items documented.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{totalItems}</p>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            Estimated Value
                        </CardTitle>
                        <CardDescription>Total value of items.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{formatCurrency(totalValue)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Conditional Content: Empty State or Item Previews */}
            {hasItems ? (
                <>
                    {/* Quick Filters (Placeholders) */}
                    <div className="flex flex-wrap gap-2">
                        <h3 className="text-sm font-medium mr-2 self-center">Quick Filters:</h3>
                        <Button variant="outline" size="sm">High Value</Button>
                        <Button variant="outline" size="sm">Electronics</Button>
                        <Button variant="outline" size="sm">Furniture</Button>
                    </div>

                    {/* Recent Items Preview */}
                    <section>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">Recently Added</h2>
                            <Link href="/app/catalog" passHref>
                                <Button variant="outline" size="sm">View All Items</Button>
                            </Link>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
                            {recentItems.map((item) => (
                                <Link key={item.id} href={`/app/item/${item.id}`} passHref> {/* Link to future item detail page */}
                                    <ItemPreviewCard item={item} />
                                </Link>
                            ))}
                        </div>
                    </section>
                </>
            ) : (
                // Empty State
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle>Welcome to Padlox!</CardTitle>
                        <CardDescription>Start documenting your belongings for peace of mind and insurance readiness.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center text-center gap-4 p-8">
                        <Boxes size={64} className="text-muted-foreground" />
                        <p>You haven't added any items yet.</p>
                        {/* Link to capture flow (Prompt 4) */}
                        <Link href="/app/capture" passHref>
                            <Button size="lg">
                                <Plus className="mr-2 h-4 w-4" /> Start Capturing
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}