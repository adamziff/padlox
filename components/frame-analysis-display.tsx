'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/db/schema';

// Configure Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

interface ScratchItem {
    id: string;
    session_id: string;
    caption: string;
    description?: string;
    category?: string;
    estimated_value?: number;
    confidence: number;
    image_url: string;
    sequence_order?: number;
    captured_at: string;
}

interface FrameAnalysisDisplayProps {
    sessionId: string;
}

export function FrameAnalysisDisplay({ sessionId }: FrameAnalysisDisplayProps) {
    const [items, setItems] = useState<ScratchItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Load existing items
        const loadItems = async () => {
            setIsLoading(true);

            const { data, error } = await supabase
                .from('scratch_items')
                .select('*')
                .eq('session_id', sessionId)
                .order('captured_at', { ascending: true });

            if (error) {
                console.error('Error loading scratch items:', error);
            } else if (data) {
                setItems(data as unknown as ScratchItem[]);
            }

            setIsLoading(false);
        };

        loadItems();

        // Subscribe to realtime updates
        const channel = supabase
            .channel('scratch-items')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'scratch_items',
                filter: `session_id=eq.${sessionId}`
            }, (payload) => {
                // Add new item to the list
                setItems(prev => [...prev, payload.new as unknown as ScratchItem]);
            })
            .subscribe();

        // Cleanup
        return () => {
            supabase.removeChannel(channel);
        };
    }, [sessionId]);

    // Group items by image URL (frames)
    const frameGroups = items.reduce<Record<string, ScratchItem[]>>((groups, item) => {
        if (!groups[item.image_url]) {
            groups[item.image_url] = [];
        }
        groups[item.image_url].push(item);
        return groups;
    }, {});

    if (isLoading) {
        return <div className="p-4">Loading frame analysis...</div>;
    }

    if (items.length === 0) {
        return <div className="p-4">No items detected yet.</div>;
    }

    return (
        <div className="frame-analysis-container space-y-6">
            <h2 className="text-xl font-semibold">Analyzed Items ({items.length})</h2>

            {Object.entries(frameGroups).map(([imageUrl, frameItems]) => (
                <div key={imageUrl} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="frame-image p-2 bg-gray-50">
                        <img
                            src={imageUrl}
                            alt="Frame"
                            className="max-h-64 object-contain mx-auto"
                        />
                    </div>

                    <div className="p-4">
                        <h3 className="font-medium">Items in this frame ({frameItems.length})</h3>

                        <div className="grid gap-4 mt-2">
                            {frameItems.map(item => (
                                <div key={item.id} className="border border-gray-100 rounded p-2">
                                    <div className="flex justify-between">
                                        <h4 className="font-semibold">{item.caption}</h4>
                                        <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                            {item.category || 'Unknown'}
                                        </span>
                                    </div>

                                    {item.description && (
                                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                    )}

                                    <div className="flex justify-between mt-2 text-sm">
                                        {item.estimated_value !== undefined && (
                                            <span className="font-medium">${item.estimated_value.toFixed(2)}</span>
                                        )}
                                        <span className="text-gray-500">
                                            Confidence: {Math.round(item.confidence * 100)}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
} 