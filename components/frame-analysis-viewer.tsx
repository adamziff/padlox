/**
 * Component for displaying real-time frame analysis results.
 * Shows a timeline of analyzed frames with their captions.
 */

import { useEffect, useState } from 'react';
import { useFrameAnalysis, ScratchItem } from '@/hooks/use-frame-analysis';
import { Card, CardContent } from '@/components/ui/card';
import { DownloadIcon, ImageIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface FrameAnalysisViewerProps {
    assetId: string;
    className?: string;
    showDownload?: boolean;
    maxHeight?: number;
}

export function FrameAnalysisViewer({
    assetId,
    className,
    showDownload = false,
    maxHeight = 300,
}: FrameAnalysisViewerProps) {
    const {
        items,
        isActive,
        isLoaded,
        error,
    } = useFrameAnalysis({
        assetId,
        autoSubscribe: true,
    });

    const [selectedItem, setSelectedItem] = useState<ScratchItem | null>(null);

    // Select first item when data loads
    useEffect(() => {
        if (items.length > 0 && !selectedItem) {
            setSelectedItem(items[0]);
        }
    }, [items, selectedItem]);

    // Format the timestamp for display
    const formatTimestamp = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
            return 'Invalid time';
        }
    };

    // Handle download of selected image
    const handleDownload = async () => {
        if (!selectedItem?.image_url) return;

        try {
            const response = await fetch(selectedItem.image_url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `frame-${selectedItem.id}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download image:', err);
        }
    };

    // If there's an error loading the data
    if (error) {
        return (
            <Card className={cn("border-red-200", className)}>
                <CardContent className="p-4">
                    <p className="text-red-500">Error loading frame analysis: {error.message}</p>
                </CardContent>
            </Card>
        );
    }

    // If the data is still loading
    if (!isLoaded) {
        return (
            <Card className={cn("border-gray-200", className)}>
                <CardContent className="p-4 flex items-center justify-center h-32">
                    <p className="text-gray-500 animate-pulse flex items-center gap-2">
                        <SparklesIcon className="h-4 w-4" />
                        Loading frame analysis...
                    </p>
                </CardContent>
            </Card>
        );
    }

    // If there are no items
    if (items.length === 0) {
        return (
            <Card className={cn("border-gray-200", className)}>
                <CardContent className="p-4 flex items-center justify-center h-32">
                    <p className="text-gray-500 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        {isActive
                            ? "Waiting for frame analysis to begin..."
                            : "No frames analyzed for this asset."}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("border-gray-200", className)}>
            <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    {/* Frame preview */}
                    <div className="relative bg-black aspect-video flex items-center justify-center">
                        {selectedItem?.image_url ? (
                            <div className="relative w-full h-full">
                                <Image
                                    src={selectedItem.image_url}
                                    alt={selectedItem.caption || 'Frame preview'}
                                    fill
                                    className="object-contain"
                                />

                                {showDownload && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
                                        onClick={handleDownload}
                                    >
                                        <DownloadIcon className="h-4 w-4 text-white" />
                                    </Button>
                                )}

                                {selectedItem.caption && (
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/70 text-white text-xs md:text-sm">
                                        <p>{selectedItem.caption}</p>
                                        {selectedItem.confidence !== null && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className="text-xs text-gray-300">Confidence:</span>
                                                <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500"
                                                        style={{ width: `${(selectedItem.confidence || 0) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-gray-300">
                                                    {Math.round((selectedItem.confidence || 0) * 100)}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-white/70 text-sm">No frame selected</p>
                        )}
                    </div>

                    {/* Timeline */}
                    <div>
                        <div className="h-full overflow-y-auto" style={{ maxHeight: `${maxHeight}px` }}>
                            <div className="p-4">
                                <h3 className="text-sm font-medium mb-2 flex items-center justify-between">
                                    <span>Timeline</span>
                                    {isActive && (
                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full animate-pulse">
                                            Live
                                        </span>
                                    )}
                                </h3>

                                <div className="space-y-1.5">
                                    {items.map((item) => (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "relative border border-gray-200 rounded-md p-2 cursor-pointer hover:bg-gray-50 transition-colors",
                                                selectedItem?.id === item.id && "bg-blue-50 border-blue-200"
                                            )}
                                            onClick={() => setSelectedItem(item)}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-xs text-gray-500">
                                                    {formatTimestamp(item.captured_at)}
                                                </p>
                                                {item.confidence !== null && (
                                                    <span className="text-xs text-gray-500">
                                                        {Math.round((item.confidence || 0) * 100)}%
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs line-clamp-2">
                                                {item.caption || 'No caption available'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
} 