'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { uploadToS3 } from '@/utils/s3';
import { AssetWithMuxData } from '@/types/mux';
import { User } from '@supabase/supabase-js';

// Define the calculation function separately for clarity
const calculateTotals = (assets: AssetWithMuxData[]) => {
    // Filter assets to include only 'item' and 'image' types for the count
    const countableAssets = assets.filter(asset => 
        asset.media_type === 'item' || asset.media_type === 'image'
    );
    const totalItems = countableAssets.length;
    const totalValue = assets.reduce((sum: number, asset: AssetWithMuxData) => {
        const value = typeof asset.estimated_value === 'number' ? asset.estimated_value : 0;
        return sum + value;
    }, 0);
    return { totalItems, totalValue };
};

// Re-declare the ActiveUpload type here or import if moved to a shared types file
type ActiveUpload = {
    assetId: string;
    status: 'uploading' | 'processing' | 'preparing_transcription' | 'transcribing' | 'analyzing' | 'complete' | 'error';
    message: string;
    startTime: number;
}

type UseDashboardLogicProps = {
    initialAssets: AssetWithMuxData[];
    user: User;
    initialTotalItems: number;
    initialTotalValue: number;
}

export function useDashboardLogic({ 
    initialAssets, 
    user, 
    initialTotalItems,
    initialTotalValue 
}: UseDashboardLogicProps) {
    const [showCamera, setShowCamera] = useState(false);
    const [capturedFile, setCapturedFile] = useState<File | null>(null);
    const [assets, setAssets] = useState<AssetWithMuxData[]>(initialAssets);
    const [totalItems, setTotalItems] = useState<number>(initialTotalItems);
    const [totalValue, setTotalValue] = useState<number>(initialTotalValue);
    const [selectedAsset, setSelectedAsset] = useState<AssetWithMuxData | null>(null);
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
    const [thumbnailTokens, setThumbnailTokens] = useState<Record<string, string>>({});
    const [activeUploads, setActiveUploads] = useState<Record<string, ActiveUpload>>({});

    const supabase = createClient();

    const fetchAndUpdateAssetState = useCallback(async (assetId: string) => {
        console.log(`[FETCH & UPDATE] Fetching updated data for asset ${assetId}`);
        try {
            const { data: updatedAssetData, error } = await supabase
                .from('assets')
                .select(`
                    *,
                    asset_rooms(
                        rooms(*)
                    ),
                    asset_tags(
                        tags(*)
                    )
                `)
                .eq('id', assetId)
                .eq('user_id', user.id)
                .single();

            if (error) {
                // Silently handle asset not found (likely deleted)
                if (error.code === 'PGRST116') {
                     setAssets(prevAssets => prevAssets.filter(a => a.id !== assetId));
                     console.log(`[FETCH & UPDATE] Asset ${assetId} not found after update, removing from local state.`);
                     return;
                }
                
                // Only log other errors
                console.error(`[FETCH & UPDATE] Error fetching asset ${assetId}:`, {
                    message: error.message || 'Unknown error',
                    code: error.code || 'NO_CODE',
                    details: error.details || 'No details',
                    hint: error.hint || 'No hint',
                    fullError: error
                });
                return;
            }

        if (updatedAssetData) {
            const roomDataFromSupabase = updatedAssetData.asset_rooms;
            let room = null;
            if (roomDataFromSupabase && typeof roomDataFromSupabase === 'object' && !Array.isArray(roomDataFromSupabase) && roomDataFromSupabase.rooms) {
                room = roomDataFromSupabase.rooms;
            } else if (Array.isArray(roomDataFromSupabase) && roomDataFromSupabase.length > 0 && roomDataFromSupabase[0] && roomDataFromSupabase[0].rooms) {
                room = roomDataFromSupabase[0].rooms;
            }

            const tagsData = updatedAssetData.asset_tags;
            const tags = Array.isArray(tagsData) ? tagsData.map((at: any) => at.tags).filter(tag => tag !== null && typeof tag === 'object') : [];

            let processedAsset = {
                ...updatedAssetData,
                room,
                tags,
                asset_rooms: undefined,
                asset_tags: undefined,
            } as AssetWithMuxData;
            
            if (processedAsset.media_type === 'image' && processedAsset.media_url && !processedAsset.media_url.startsWith('http')) {
                processedAsset = {
                    ...processedAsset,
                    media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${processedAsset.media_url}`
                };
            }

            setAssets(prevAssets => {
                const existingAssetIndex = prevAssets.findIndex(a => a.id === processedAsset.id);
                let newAssetsList;
                if (existingAssetIndex !== -1) {
                    newAssetsList = [...prevAssets];
                    newAssetsList[existingAssetIndex] = processedAsset;
                    console.log(`[FETCH & UPDATE] Updated asset ${processedAsset.id} in local state.`);
                } else {
                    newAssetsList = [processedAsset, ...prevAssets];
                    console.warn(`[FETCH & UPDATE] Asset ${processedAsset.id} was not in local state but re-fetched and added. This might indicate a sync issue or stale state elsewhere.`);
                }
                const { totalItems: newTotalItems, totalValue: newTotalValue } = calculateTotals(newAssetsList);
                setTotalItems(newTotalItems);
                setTotalValue(newTotalValue);
                return newAssetsList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            });

            setSelectedAsset(prevSelectedAsset => {
                if (prevSelectedAsset?.id === processedAsset.id) {
                    console.log(`[FETCH & UPDATE] Updated selectedAsset state for ${processedAsset.id} with fully processed relations via functional update.`);
                    return processedAsset;
                }
                return prevSelectedAsset;
            });
        }
        } catch (fetchError) {
            console.error(`[FETCH & UPDATE] Unexpected error fetching asset ${assetId}:`, fetchError);
        }
    }, [supabase, user?.id, setAssets, setSelectedAsset, setTotalItems, setTotalValue]);

    // Fetch thumbnail token for Mux videos
    const fetchThumbnailToken = useCallback(async (playbackId: string, timestamp?: number) => {
        try {
            // Construct the URL, adding the timestamp only if provided
            let apiUrl = `/api/mux/token?playbackId=${playbackId}&_=${Date.now()}`;
            if (timestamp !== undefined && timestamp !== null) {
                apiUrl += `&time=${timestamp}`;
            }

            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Failed to get token: ${response.status}`);
            }
            const data = await response.json();
            if (data.tokens?.thumbnail) {
                // Use composite key: playbackId for videos, playbackId-timestamp for items
                const tokenKey = timestamp !== undefined && timestamp !== null ? `${playbackId}-${timestamp}` : playbackId;
                setThumbnailTokens(prev => {
                    const newState = {
                        ...prev,
                        [tokenKey]: data.tokens.thumbnail
                    };
                    return newState;
                });
                return data.tokens.thumbnail;
            }
            return null;
        } catch (err) {
            console.error('Error fetching thumbnail token:', err);
            return null;
        }
    }, []);

    // Test function to manually trigger realtime events (for debugging)
    const testRealtimeConnection = useCallback(async () => {
        console.log('[TEST REALTIME] Testing realtime connection...');
        try {
            // Create a test asset
            const { data: testAsset, error: insertError } = await supabase
                .from('assets')
                .insert([{
                    user_id: user.id,
                    name: 'TEST_REALTIME_DELETE',
                    description: 'Test asset for realtime debugging',
                    estimated_value: 1,
                    media_type: 'item',
                    media_url: 'test-realtime-url' // Required field
                }])
                .select()
                .single();

            if (insertError) {
                console.error('[TEST REALTIME] Error creating test asset:', insertError);
                return;
            }

            console.log('[TEST REALTIME] Created test asset:', testAsset);

            // Wait a moment for the INSERT event to be processed
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Now delete it
            const { error: deleteError } = await supabase
                .from('assets')
                .delete()
                .eq('id', testAsset.id);

            if (deleteError) {
                console.error('[TEST REALTIME] Error deleting test asset:', deleteError);
                return;
            }

            console.log('[TEST REALTIME] Deleted test asset:', testAsset.id);
        } catch (error) {
            console.error('[TEST REALTIME] Test failed:', error);
        }
    }, [supabase, user.id]);

    // Expose test function globally for debugging
    useEffect(() => {
        (window as any).testRealtimeConnection = testRealtimeConnection;
        return () => {
            delete (window as any).testRealtimeConnection;
        };
    }, [testRealtimeConnection]);

    // Setup realtime subscription for assets
    useEffect(() => {
        const channel = supabase
            .channel('assets-changes')
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'assets',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('[REALTIME HANDLER] Received payload:', payload);
                    console.log('[REALTIME HANDLER] Event type:', payload.eventType);
                    console.log('[REALTIME HANDLER] Schema:', payload.schema);
                    console.log('[REALTIME HANDLER] Table:', payload.table);
                    if (payload.old) console.log('[REALTIME HANDLER] Old data:', payload.old);
                    if (payload.new) console.log('[REALTIME HANDLER] New data:', payload.new);
                    
                    // Function to update assets and recalculate totals
                    const updateStateAndTotals = (updater: (prevAssets: AssetWithMuxData[]) => AssetWithMuxData[]) => {
                        setAssets(prevAssets => {
                            const updatedAssets = updater(prevAssets)
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                            // Recalculate and set totals based on the final updated assets
                            const { totalItems: newTotalItems, totalValue: newTotalValue } = calculateTotals(updatedAssets);
                            setTotalItems(newTotalItems);
                            setTotalValue(newTotalValue);
                            console.log(`[REALTIME HANDLER] State updated. New count: ${updatedAssets.length}, New Total Value: ${newTotalValue}`);
                            return updatedAssets;
                        });
                    };

                    if (payload.eventType === 'INSERT') {
                        const newAsset = payload.new as AssetWithMuxData;
                        console.log(`[REALTIME HANDLER] INSERT detected: ${newAsset.id}`);

                        // Check if this INSERT corresponds to a completed analysis for an item asset
                        // Find the original upload notification based on the source_video_id
                        if (newAsset.media_type === 'item' && newAsset.source_video_id) {
                            setActiveUploads(prev => {
                                let uploadIdToRemove: string | null = null;
                                console.log(`[REALTIME INSERT] Checking for removal. Item ${newAsset.id} source ${newAsset.source_video_id}. Current uploads:`, JSON.stringify(prev));
                                // Iterate through existing uploads to find the one matching the source video ID.
                                // Remove it if found, regardless of current status ('preparing', 'transcribing', 'analyzing') 
                                // because the item insert signifies the end of the relevant pipeline.
                                for (const [uploadId, upload] of Object.entries(prev)) {
                                    if (upload.assetId === newAsset.source_video_id) {
                                        uploadIdToRemove = uploadId;
                                        console.log(`[REALTIME HANDLER] Analysis/Item generation complete for source video ${newAsset.source_video_id} (item ${newAsset.id} inserted). Removing notification ${uploadIdToRemove} (status was ${upload.status}).`);
                                        break; // Found the one we need to remove
                                    }
                                }

                                // If we found the matching upload notification, remove it
                                if (uploadIdToRemove) {
                                    const next = { ...prev };
                                    delete next[uploadIdToRemove];
                                    return next;
                                }
                                
                                // If no matching 'analyzing' notification found, return previous state
                                return prev;
                            });
                        }

                        updateStateAndTotals(prevAssets => {
                             // Check if the asset already exists to prevent duplicates from rapid events
                            if (prevAssets.some(asset => asset.id === newAsset.id)) {
                                console.warn(`[REALTIME HANDLER] Duplicate INSERT event ignored for asset ${newAsset.id}`);
                                return prevAssets; // Return previous state if duplicate
                            }

                            // Construct full media URL for S3 images if necessary
                            let assetToAdd = newAsset;
                            if (assetToAdd.media_type === 'image' && assetToAdd.media_url && !assetToAdd.media_url.startsWith('http')) {
                                assetToAdd = {
                                    ...assetToAdd,
                                    media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${assetToAdd.media_url}`
                                };
                                console.log(`[REALTIME HANDLER] Transformed INSERT image media_url for ${assetToAdd.id} to: ${assetToAdd.media_url}`);
                            }
                            return [assetToAdd, ...prevAssets];
                        });

                        // Clear potential errors for this asset if it was previously errored
                        if (mediaErrors[newAsset.id]) {
                            setMediaErrors(prev => { const next = { ...prev }; delete next[newAsset.id]; return next; });
                        }
                    }
                    else if (payload.eventType === 'UPDATE') {
                        const updatedAsset = payload.new as AssetWithMuxData;
                        const oldAsset = payload.old as AssetWithMuxData;
                        const changes = Object.keys(updatedAsset)
                            .filter(key => updatedAsset[key as keyof AssetWithMuxData] !== oldAsset[key as keyof AssetWithMuxData])
                            .map(key => `${key}: ${oldAsset[key as keyof AssetWithMuxData]} → ${updatedAsset[key as keyof AssetWithMuxData]}`)
                            .join(', ');
                        console.log(`[REALTIME HANDLER] UPDATE detected for asset ${updatedAsset.id}: ${changes}`);

                        // Update Mux processing status display
                        if ('mux_processing_status' in updatedAsset && 'mux_processing_status' in oldAsset &&
                            updatedAsset.mux_processing_status !== oldAsset.mux_processing_status) {
                            if (updatedAsset.mux_processing_status === 'ready') {
                                setActiveUploads(prev => {
                                    const newUploads = { ...prev };
                                    let needsUpdate = false;
                                    Object.keys(newUploads).forEach(uploadId => {
                                        // Find the notification linked to the updated asset ID and currently in 'processing' state
                                        if (newUploads[uploadId].assetId === updatedAsset.id && newUploads[uploadId].status === 'processing') {
                                            // Mux video is ready. Move to preparing transcription state.
                                            console.log(`[REALTIME UPDATE] Mux ready for ${updatedAsset.id}. Moving to 'preparing_transcription'.`);
                                            newUploads[uploadId].status = 'preparing_transcription';
                                            newUploads[uploadId].message = 'Video ready. Preparing transcription...';
                                            needsUpdate = true;
                                        }
                                    });
                                    return needsUpdate ? newUploads : prev;
                                });
                                // Fetch thumbnail if ready and token not already present
                                if (updatedAsset.mux_playback_id && !thumbnailTokens[updatedAsset.mux_playback_id]) {
                                    // Pass timestamp if it's an item asset
                                    const timestamp = updatedAsset.media_type === 'item' && updatedAsset.item_timestamp != null ? updatedAsset.item_timestamp : undefined;
                                    fetchThumbnailToken(updatedAsset.mux_playback_id, timestamp);
                                }
                            }
                            // Handle if Mux status goes to 'error' (matching the defined type)
                            else if (updatedAsset.mux_processing_status === 'error') { 
                                setActiveUploads(prev => {
                                    const newUploads = { ...prev };
                                    let needsUpdate = false;
                                    Object.keys(newUploads).forEach(uploadId => {
                                         if (newUploads[uploadId].assetId === updatedAsset.id && 
                                             (newUploads[uploadId].status === 'processing' || newUploads[uploadId].status === 'uploading' || newUploads[uploadId].status === 'preparing_transcription')) { // Also catch errors during preparing
                                             console.error(`[REALTIME UPDATE] Mux processing failed for ${updatedAsset.id}. Setting notification to error.`);
                                             newUploads[uploadId].status = 'error';
                                             // Use a generic message as mux_error_message isn't typed
                                             newUploads[uploadId].message = `Video processing failed: Mux reported an error.`; 
                                             needsUpdate = true;
                                         }
                                    });
                                    return needsUpdate ? newUploads : prev;
                                });
                            }
                        }

                        // Update transcript processing status display
                        if ('transcript_processing_status' in updatedAsset && 'transcript_processing_status' in oldAsset &&
                            updatedAsset.transcript_processing_status !== oldAsset.transcript_processing_status) {
                            console.log(`[REALTIME UPDATE] Transcript status changed for asset ${updatedAsset.id}: `, `${oldAsset.transcript_processing_status} → ${updatedAsset.transcript_processing_status}`);

                            setActiveUploads(prev => {
                                const newUploads = { ...prev };
                                let needsUpdate = false;
                                Object.keys(newUploads).forEach(uploadId => {
                                    if (newUploads[uploadId].assetId === updatedAsset.id) {
                                        const currentStatus = newUploads[uploadId].status;

                                        // Transition from Preparing to Transcribing
                                        if (currentStatus === 'preparing_transcription' && updatedAsset.transcript_processing_status === 'processing') {
                                            console.log(`[REALTIME UPDATE] Asset ${updatedAsset.id} starting transcription.`);
                                            newUploads[uploadId].status = 'transcribing';
                                            newUploads[uploadId].message = 'Transcription in progress...';
                                            needsUpdate = true;
                                        }
                                        // Transition from Transcribing to Analyzing
                                        else if (currentStatus === 'transcribing' && updatedAsset.transcript_processing_status === 'completed') {
                                            console.log(`[REALTIME UPDATE] Asset ${updatedAsset.id} transcription complete, moving to analyzing.`);
                                            newUploads[uploadId].status = 'analyzing';
                                            newUploads[uploadId].message = 'Transcription complete. Analyzing item...';
                                            needsUpdate = true;
                                        }
                                        // Handle Transcription Error (from preparing or transcribing)
                                        else if ((currentStatus === 'preparing_transcription' || currentStatus === 'transcribing') && updatedAsset.transcript_processing_status === 'error') {
                                            console.error(`[REALTIME UPDATE] Asset ${updatedAsset.id} transcription failed. Setting notification to error.`);
                                            newUploads[uploadId].status = 'error';
                                            newUploads[uploadId].message = `Transcription failed: ${updatedAsset.transcript_error || 'Unknown error'}`;
                                            needsUpdate = true;
                                        }
                                        // Handle Analysis completion (covered by INSERT handler, but keep the race condition check)
                                        else if (currentStatus === 'analyzing' && updatedAsset.media_type === 'item' && updatedAsset.is_processed) {
                                             console.log(`[REALTIME UPDATE] Analysis likely completed for ${updatedAsset.id} based on UPDATE, removing notification.`);
                                             delete newUploads[uploadId]; // Remove directly here
                                             needsUpdate = true;
                                        }
                                    }
                                });
                                return needsUpdate ? newUploads : prev;
                            });
                        }

                        updateStateAndTotals(prevAssets => {
                            const assetMap = new Map(prevAssets.map(asset => [asset.id, asset]));
                            assetMap.set(updatedAsset.id, updatedAsset);
                            return Array.from(assetMap.values());
                        });

                        // Update modal if the asset being viewed is the one updated
                        if (selectedAsset && selectedAsset.id === updatedAsset.id) {
                            console.log('[REALTIME UPDATE] Also updating currently selected asset in modal');
                            setSelectedAsset(updatedAsset); // Update modal state
                        }

                        // Clear media errors if the asset updates successfully
                        if (mediaErrors[updatedAsset.id]) {
                            setMediaErrors(prev => { const next = { ...prev }; delete next[updatedAsset.id]; return next; });
                        }
                    }
                    else if (payload.eventType === 'DELETE') {
                        const deletedAssetId = payload.old.id;
                        console.log(`[REALTIME HANDLER] DELETE detected: ${deletedAssetId}`);
                        console.log(`[REALTIME HANDLER] DELETE payload:`, payload);
                        updateStateAndTotals(prevAssets => {
                            const filteredAssets = prevAssets.filter(asset => asset.id !== deletedAssetId);
                            console.log(`[REALTIME HANDLER] Filtered assets from ${prevAssets.length} to ${filteredAssets.length}`);
                            return filteredAssets;
                        });
                        
                        if (selectedAsset && selectedAsset.id === deletedAssetId) {
                            setSelectedAsset(null);
                        }
                        if (selectedAssets.has(deletedAssetId)) {
                            setSelectedAssets(prev => { const next = new Set(prev); next.delete(deletedAssetId); return next; });
                        }
                    }
                }
            )
            .subscribe((status, err) => {
                // Log status changes and errors
                console.log(`[REALTIME SUBSCRIBE] Assets subscription status: ${status}`);
                if (err) {
                    console.error('[REALTIME SUBSCRIBE] Subscription error:', err);
                }
                if (status === 'SUBSCRIBED') {
                    console.log('[REALTIME SUBSCRIBE] Successfully subscribed to asset changes!');
                    console.log(`[REALTIME SUBSCRIBE] Listening for changes to assets for user: ${user.id}`);
                }
                if (status === 'CHANNEL_ERROR') {
                    console.error('[REALTIME SUBSCRIBE] Channel error - subscription may not be working');
                }
            });

        // Realtime for asset_tags
        const assetTagsChannel = supabase
            .channel('asset-tags-changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'asset_tags' }, 
                async (payload) => {
                    console.log('[ASSET_TAGS CHANNEL] Received payload:', payload);
                    let assetIdToUpdate: string | null = null;

                    if (payload.eventType === 'INSERT' && payload.new && payload.new.asset_id) {
                        assetIdToUpdate = payload.new.asset_id;
                    } else if (payload.eventType === 'DELETE' && payload.old && payload.old.asset_id) {
                        assetIdToUpdate = payload.old.asset_id;
                    }

                    if (assetIdToUpdate) {
                        console.log(`[ASSET_TAGS CHANNEL] Change detected for asset_id: ${assetIdToUpdate}. Re-fetching asset.`);
                        await fetchAndUpdateAssetState(assetIdToUpdate);
                    }
                }
            )
            .subscribe(async (status) => {
                console.log('[ASSET_TAGS CHANNEL] Status:', status);
            });

        // Realtime for asset_rooms
        const assetRoomsChannel = supabase
            .channel('asset-rooms-changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'asset_rooms' }, 
                async (payload) => {
                    console.log('[ASSET_ROOMS CHANNEL] Received payload:', payload);
                    let assetIdToUpdate: string | null = null;

                    if (payload.eventType === 'INSERT' && payload.new && payload.new.asset_id) {
                        assetIdToUpdate = payload.new.asset_id;
                    } else if (payload.eventType === 'DELETE' && payload.old && payload.old.asset_id) {
                        // For asset_rooms, a DELETE means the asset is now roomless
                        // or if a room_id is part of old, it refers to that.
                        // The asset_id is the key.
                        assetIdToUpdate = payload.old.asset_id;
                    }
                    
                    if (assetIdToUpdate) {
                        console.log(`[ASSET_ROOMS CHANNEL] Change detected for asset_id: ${assetIdToUpdate}. Re-fetching asset.`);
                        await fetchAndUpdateAssetState(assetIdToUpdate);
                    }
                }
            )
            .subscribe(async (status) => {
                console.log('[ASSET_ROOMS CHANNEL] Status:', status);
            });

        // Realtime for tags table itself (for name updates)
        const tagsChannel = supabase
            .channel('tags-table-changes')
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tags',
                    filter: `user_id=eq.${user.id}` // Assuming tags are user-specific
                },
                (payload) => {
                    console.log('[TAGS TABLE CHANNEL] Received UPDATE payload:', payload);
                    const updatedTag = payload.new as { id: string; name: string; user_id: string }; // Adjust type as needed

                    if (updatedTag && updatedTag.id && updatedTag.name) {
                        setAssets(prevAssets => {
                            const newAssetsList = prevAssets.map(asset => {
                                if (asset.tags && asset.tags.some(t => t.id === updatedTag.id)) {
                                    return {
                                        ...asset,
                                        tags: asset.tags.map(t =>
                                            t.id === updatedTag.id ? { ...t, name: updatedTag.name } : t
                                        )
                                    };
                                }
                                return asset;
                            });

                            // Check if any asset was actually updated to avoid unnecessary state change if tag wasn't in use
                            const changed = JSON.stringify(newAssetsList) !== JSON.stringify(prevAssets);
                            if (changed) {
                                console.log(`[TAGS TABLE CHANNEL] Updated assets with new tag name for tag ID: ${updatedTag.id}`);
                                // Recalculate totals if necessary, though tag name change doesn't affect totals
                                // const { totalItems: newTotalItems, totalValue: newTotalValue } = calculateTotals(newAssetsList);
                                // setTotalItems(newTotalItems);
                                // setTotalValue(newTotalValue);
                                return newAssetsList; // No sort needed as order isn't changed by tag name update
                            }
                            return prevAssets;
                        });

                        // Also update selectedAsset if it contains the updated tag
                        setSelectedAsset(prevSelectedAsset => {
                            if (prevSelectedAsset && prevSelectedAsset.tags && prevSelectedAsset.tags.some(t => t.id === updatedTag.id)) {
                                return {
                                    ...prevSelectedAsset,
                                    tags: prevSelectedAsset.tags.map(t =>
                                        t.id === updatedTag.id ? { ...t, name: updatedTag.name } : t
                                    )
                                };
                            }
                            return prevSelectedAsset;
                        });
                    }
                }
            )
            .subscribe((status, err) => {
                console.log(`[TAGS TABLE CHANNEL] Subscription status: ${status}`);
                if (err) {
                    console.error('[TAGS TABLE CHANNEL] Subscription error:', err);
                }
            });

        return () => {
            console.log('[REALTIME CLEANUP] Unsubscribing from asset changes.');
            channel.unsubscribe();
            supabase.removeChannel(assetTagsChannel);
            supabase.removeChannel(assetRoomsChannel);
            supabase.removeChannel(tagsChannel); // Unsubscribe from the new channel
        };
    }, [user.id, supabase, fetchAndUpdateAssetState, fetchThumbnailToken]);

    // Handle captured media files
    const handleCapture = useCallback(async (file: File) => {
        try {
            if (file.type.startsWith('video/')) {
                setShowCamera(false);
                const uploadId = `upload_${Date.now()}`;
                setActiveUploads(prev => ({
                    ...prev,
                    [uploadId]: {
                        assetId: '', status: 'uploading',
                        message: 'Uploading video to server... Please do not refresh until upload completes.',
                        startTime: Date.now()
                    }
                }));
                const correlationId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const metadata = {
                    name: `Video - ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}`,
                    description: null, estimated_value: null
                };
                const response = await fetch('/api/mux/upload', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ metadata, correlationId }),
                });
                if (!response.ok) throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
                const { uploadUrl, asset, clientReferenceId } = await response.json();
                if (!uploadUrl) throw new Error('No upload URL returned from the server');
                if (asset) {
                    if (clientReferenceId) {
                        try {
                            localStorage.setItem('lastUploadReference', clientReferenceId);
                            localStorage.setItem('lastUploadTime', Date.now().toString());
                        } catch (e) { console.warn('Could not store upload reference in localStorage:', e); }
                    }
                    setActiveUploads(prev => ({
                        ...prev,
                        [uploadId]: { 
                            ...prev[uploadId], 
                            assetId: asset.id, 
                            status: 'processing', 
                            message: 'Analyzing video and transcript (usually 10-30 seconds)'
                        }
                    }));
                }
                const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                if (!uploadResponse.ok) throw new Error(`Failed to upload to Mux: ${uploadResponse.status} ${uploadResponse.statusText}`);
            } else {
                setCapturedFile(file);
                setShowCamera(false);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const uploadIds = Object.keys(activeUploads);
            if (uploadIds.length > 0) {
                const latestUploadId = uploadIds[uploadIds.length - 1];
                setActiveUploads(prev => ({ ...prev, [latestUploadId]: { ...prev[latestUploadId], status: 'error', message: `Error: ${errorMessage}` } }));
                setTimeout(() => {
                    setActiveUploads(prev => { const newUploads = { ...prev }; delete newUploads[latestUploadId]; return newUploads; });
                }, 5000);
            }
            console.error('Error handling capture:', error);
            alert(error instanceof Error ? error.message : 'Failed to process capture. Please try again.');
            setShowCamera(false);
        }
    }, [activeUploads, setActiveUploads, setAssets, setCapturedFile, setShowCamera]);

    // Add a recovery mechanism for uploads after page refresh
    useEffect(() => {
        try {
            const lastUploadReference = localStorage.getItem('lastUploadReference');
            const lastUploadTime = localStorage.getItem('lastUploadTime');
            if (lastUploadReference && lastUploadTime) {
                const timeSinceUpload = Date.now() - Number(lastUploadTime);
                if (timeSinceUpload < 3600000) {
                    const existingAsset = assets.find(a => 'client_reference_id' in a && a.client_reference_id === lastUploadReference);
                    if (!existingAsset) {
                        supabase.from('assets').select('*').eq('client_reference_id', lastUploadReference).eq('user_id', user.id).single()
                            .then(({ data, error }) => {
                                if (data && !error) {
                                    setAssets(prev => {
                                        if (prev.some(a => a.id === data.id)) return prev;
                                        return [data as AssetWithMuxData, ...prev];
                                    });
                                } else if (error) {
                                    localStorage.removeItem('lastUploadReference');
                                    localStorage.removeItem('lastUploadTime');
                                }
                            });
                    }
                } else {
                    localStorage.removeItem('lastUploadReference');
                    localStorage.removeItem('lastUploadTime');
                }
            }
        } catch (e) { console.warn('Error checking for upload recovery:', e); }
    }, [assets, supabase, user.id]);

    // Handle saving images uploaded via the camera
    const handleSave = useCallback(async (url: string, metadata: { name: string; description: string | null; estimated_value: number | null }) => {
        try {
            if (!capturedFile) { console.error('No file captured'); return; }
            const response = await uploadToS3(capturedFile, metadata);
            const { key } = response;
            const { data: asset, error } = await supabase
                .from('assets').insert([{ user_id: user.id, name: metadata.name, description: metadata.description, estimated_value: metadata.estimated_value, media_url: key, media_type: capturedFile.type.startsWith('video/') ? 'video' : 'image' }]).select().single();
            if (error) throw error;
            const transformedAsset = { ...asset, media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}` } as AssetWithMuxData;
            setCapturedFile(null);
        } catch (error: unknown) {
            const err = error as Error & { details?: string; hint?: string; code?: string; name?: string };
            console.error('Error saving asset:', { message: err?.message, details: err?.details, stack: err?.stack, name: err?.name });
            alert('Failed to save asset. Please try again.');
        }
    }, [capturedFile, setCapturedFile, supabase, user.id]);

    const processClientSideAssetUpdate = useCallback((updatedAsset: AssetWithMuxData) => {
        // This function is called when a client component (e.g., AssetModal via AssetRoomSelector)
        // reports an update to an asset (e.g., its room or tags have changed).
        // It updates the main `assets` list optimistically.
        // Database operations are assumed to have been initiated by the calling component.
        // Realtime events from Supabase will eventually bring the canonical state.

        setAssets(prevAssets => {
            const newAssetsList = prevAssets.map(a =>
                a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a // Merge changes
            );
            // Recalculate totals with the optimistically updated list
            const { totalItems: newTotalItems, totalValue: newTotalValue } = calculateTotals(newAssetsList);
            setTotalItems(newTotalItems);
            setTotalValue(newTotalValue);
            console.log(`[CLIENT UPDATE] Optimistically updated asset ${updatedAsset.id} in main assets list.`);
            // Re-sort, as created_at might not be the only sort factor in user's mind,
            // but primary sort is by created_at descending.
            return newAssetsList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });

        // Also update selectedAsset if it's the one being modified, ensuring it has the latest client changes.
        setSelectedAsset(prevSelectedAsset =>
            prevSelectedAsset && prevSelectedAsset.id === updatedAsset.id ? { ...prevSelectedAsset, ...updatedAsset } : prevSelectedAsset
        );
    }, [setAssets, setSelectedAsset, setTotalItems, setTotalValue]);

    // Handle asset selection for multi-select mode
    const toggleAssetSelection = useCallback((assetId: string, event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
        event.stopPropagation();
        const newSelectedAssets = new Set(selectedAssets);
        if (newSelectedAssets.has(assetId)) {
            newSelectedAssets.delete(assetId);
        } else {
            newSelectedAssets.add(assetId);
        }
        setSelectedAssets(newSelectedAssets);
    }, [selectedAssets]);

    // Handle bulk tag assignment
    const handleBulkAddTag = useCallback(async (tagId: string) => {
        const assetsToUpdate = Array.from(selectedAssets);
        let errors: { id: string, error: string }[] = [];
        
        for (const assetId of assetsToUpdate) {
            try {
                const response = await fetch(`/api/assets/${assetId}/tags`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tag_id: tagId }),
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (response.status === 409) {
                        // Tag already assigned, skip silently
                        continue;
                    }
                    throw new Error(data.error || `Failed to add tag (${response.status})`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error adding tag to asset ${assetId}:`, errorMessage);
                errors.push({ id: assetId, error: errorMessage });
            }
        }
        
        if (errors.length > 0) {
            alert(`Failed to add tag to ${errors.length} asset(s). Please check the console for details.`);
        }
    }, [selectedAssets]);

    // Handle bulk tag removal
    const handleBulkRemoveTag = useCallback(async (tagId: string) => {
        const assetsToUpdate = Array.from(selectedAssets);
        let errors: { id: string, error: string }[] = [];
        
        for (const assetId of assetsToUpdate) {
            try {
                const response = await fetch(`/api/assets/${assetId}/tags`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tag_id: tagId }),
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `Failed to remove tag (${response.status})`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error removing tag from asset ${assetId}:`, errorMessage);
                errors.push({ id: assetId, error: errorMessage });
            }
        }
        
        if (errors.length > 0) {
            alert(`Failed to remove tag from ${errors.length} asset(s). Please check the console for details.`);
        }
    }, [selectedAssets]);

    // Calculate which tags are currently applied to selected assets
    const getSelectedAssetsTagStatus = useCallback(() => {
        if (selectedAssets.size === 0) {
            return new Map<string, 'all' | 'some' | 'none'>();
        }

        const selectedAssetsList = assets.filter(asset => selectedAssets.has(asset.id));
        const tagStatus = new Map<string, 'all' | 'some' | 'none'>();

        // For each available tag, check how many selected assets have it
        assets.forEach(asset => {
            if (asset.tags) {
                asset.tags.forEach(tag => {
                    if (!tagStatus.has(tag.id)) {
                        tagStatus.set(tag.id, 'none');
                    }
                });
            }
        });

        // Count how many selected assets have each tag
        for (const [tagId] of tagStatus) {
            const assetsWithTag = selectedAssetsList.filter(asset => 
                asset.tags?.some(tag => tag.id === tagId)
            ).length;

            if (assetsWithTag === 0) {
                tagStatus.set(tagId, 'none');
            } else if (assetsWithTag === selectedAssetsList.length) {
                tagStatus.set(tagId, 'all');
            } else {
                tagStatus.set(tagId, 'some');
            }
        }

        return tagStatus;
    }, [assets, selectedAssets]);

    // Handle bulk tag toggle (add if not all have it, remove if all have it)
    const handleBulkToggleTag = useCallback(async (tagId: string) => {
        const tagStatus = getSelectedAssetsTagStatus();
        const currentStatus = tagStatus.get(tagId) || 'none';
        
        if (currentStatus === 'all') {
            // All selected assets have this tag, so remove it
            await handleBulkRemoveTag(tagId);
        } else {
            // Some or no selected assets have this tag, so add it to all
            await handleBulkAddTag(tagId);
        }
    }, [getSelectedAssetsTagStatus, handleBulkAddTag, handleBulkRemoveTag]);

    // Handle bulk room assignment
    const handleBulkAssignRoom = useCallback(async (roomId: string) => {
        const assetsToUpdate = Array.from(selectedAssets);
        let errors: { id: string, error: string }[] = [];
        
        for (const assetId of assetsToUpdate) {
            try {
                const response = await fetch(`/api/assets/${assetId}/room`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ room_id: roomId }),
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `Failed to assign room (${response.status})`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error assigning room to asset ${assetId}:`, errorMessage);
                errors.push({ id: assetId, error: errorMessage });
            }
        }
        
        if (errors.length > 0) {
            alert(`Failed to assign room to ${errors.length} asset(s). Please check the console for details.`);
        }
    }, [selectedAssets]);

    // Handle bulk room removal
    const handleBulkRemoveRoom = useCallback(async () => {
        const assetsToUpdate = Array.from(selectedAssets);
        let errors: { id: string, error: string }[] = [];
        
        for (const assetId of assetsToUpdate) {
            try {
                const response = await fetch(`/api/assets/${assetId}/room`, {
                    method: 'DELETE',
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `Failed to remove room (${response.status})`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error removing room from asset ${assetId}:`, errorMessage);
                errors.push({ id: assetId, error: errorMessage });
            }
        }
        
        if (errors.length > 0) {
            alert(`Failed to remove room from ${errors.length} asset(s). Please check the console for details.`);
        }
    }, [selectedAssets]);

    // Handle bulk delete of selected assets
    const handleBulkDelete = useCallback(async () => {
        if (!window.confirm(`Are you sure you want to delete ${selectedAssets.size} assets? This action cannot be undone.`)) return;
        setIsDeleting(true);
        const assetsToDeleteIds = Array.from(selectedAssets);
        const assetsToDelete = assets.filter(asset => assetsToDeleteIds.includes(asset.id));
        let errors: { id: string, error: string }[] = [];
        console.log(`Attempting to bulk delete ${assetsToDelete.length} assets:`, assetsToDeleteIds);
        for (const asset of assetsToDelete) {
            try {
                console.log(`Processing deletion for asset ${asset.id}, type: ${asset.media_type}`);
                if (asset.media_type === 'item') {
                    console.log(`Deleting item asset (DB only): ${asset.id}`);
                    const { error: dbError } = await supabase.from('assets').delete().eq('id', asset.id);
                    if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                } else if (asset.media_type === 'video' && asset.mux_asset_id) {
                    console.log(`Deleting source Mux asset via API: ${asset.id}`);
                    try {
                        const response = await fetch('/api/mux/delete', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ assetId: asset.id }),
                        });
                        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Mux API delete failed (${response.status})`); }
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error(`Error deleting asset ${asset.id}:`, errorMessage);
                        errors.push({ id: asset.id, error: errorMessage });
                    }
                } else if (asset.media_type === 'image' && asset.media_url && !asset.mux_asset_id) {
                    console.log(`Deleting S3 image asset (DB & S3): ${asset.id}`);
                    const { error: dbError } = await supabase.from('assets').delete().eq('id', asset.id);
                    if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);
                    const key = asset.media_url.split('/').pop();
                    if (key) {
                        const response = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
                        if (!response.ok) console.error(`Failed to delete S3 object for key ${key}, but DB record deleted.`);
                    } else console.warn(`Could not determine S3 key for asset ${asset.id}`);
                } else {
                    console.warn(`Unsupported asset type or state for deletion: ${asset.id}, type: ${asset.media_type}, mux: ${!!asset.mux_asset_id}`);
                    throw new Error('Unsupported asset type for deletion.');
                }
                console.log(`Successfully processed deletion for asset ${asset.id}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error deleting asset ${asset.id}:`, errorMessage);
                errors.push({ id: asset.id, error: errorMessage });
            }
        }
        const successfulDeletes = assetsToDeleteIds.filter(id => !errors.some(e => e.id === id));
        if (successfulDeletes.length > 0) {
            setAssets(prev => prev.filter(asset => !successfulDeletes.includes(asset.id)));
        }
        setSelectedAssets(new Set());
        setIsSelectionMode(false);
        setIsDeleting(false);
        if (errors.length > 0) {
            alert(`Failed to delete ${errors.length} asset(s). Please check the console for details.`);
        }
    }, [assets, selectedAssets, supabase, setAssets, setSelectedAssets, setIsSelectionMode, setIsDeleting]);

    // Handle clicking on an asset
    const handleAssetClick = useCallback((asset: AssetWithMuxData, event: React.MouseEvent) => {
        // AssetCard now determines if an asset is clickable (e.g. not a video in 'preparing' state
        // or other non-interactive states). If this function is called, we assume the asset
        // is intended to be interactive.

        // The main reason to potentially block here would be if it's a specific type of video
        // that, despite being 'ready', should not open a modal (e.g., a source video that has generated items).
        // However, `displayedAssets` in DashboardClient already filters out processed source videos.
        // Thus, any asset reaching here from a click on AssetCard should generally proceed.

        // Redundant check, as AssetCard's isClickable handles this:
        // if (asset.mux_asset_id && asset.mux_processing_status === 'preparing') return;

        // The original broad check that blocked all 'video' types:
        // if (asset.media_type === 'video') {
        //     console.log(`Clicked on video asset ${asset.id}, ignoring click for modal.`);
        //     return; 
        // }
        
        if (isSelectionMode) {
            toggleAssetSelection(asset.id, event);
        } else {
            setSelectedAsset(asset);
        }
    }, [isSelectionMode, toggleAssetSelection, setSelectedAsset]);

    // Handle media errors
    const handleMediaError = useCallback((assetId: string, url: string, error: unknown) => {
        console.error(`Error loading media:`, { assetId, url, error });
        setMediaErrors(prev => ({ ...prev, [assetId]: 'Failed to load media' }));
    }, []);

    // Handler to retry media loading
    const handleRetryMedia = useCallback((assetId: string) => {
        setMediaErrors(prev => {
            const next = { ...prev };
            delete next[assetId];
            return next;
        });
        // Optional: Force re-fetch thumbnail token if relevant
        const asset = assets.find(a => a.id === assetId);
        if (asset?.mux_playback_id) {
            // Pass timestamp if it's an item asset
            const timestamp = asset.media_type === 'item' && asset.item_timestamp != null ? asset.item_timestamp : undefined;
            // No need to check if token exists here, just refetch
            fetchThumbnailToken(asset.mux_playback_id, timestamp);
        }
    }, [assets, fetchThumbnailToken]);

    // Fetch thumbnail tokens for ready Mux videos initially and when assets change
    useEffect(() => {
        const tokensToFetch: { playbackId: string; timestamp?: number }[] = [];

        assets.forEach(asset => {
            // Fetch conditions:
            // 1. Must have a playback ID.
            // 2. If it's a VIDEO asset, it must be 'ready'.
            // 3. If it's an ITEM asset, it must have an item_timestamp.
            const isItemWithTimestamp = asset.media_type === 'item' && asset.item_timestamp != null;
            const isReadyVideo = asset.media_type === 'video' && asset.mux_processing_status === 'ready';

            if (asset.mux_playback_id && (isReadyVideo || isItemWithTimestamp)) {
                // Ensure timestamp is number or undefined, converting null
                const timestamp = isItemWithTimestamp && asset.item_timestamp != null ? asset.item_timestamp : undefined;
                const tokenKey = timestamp !== undefined ? `${asset.mux_playback_id}-${timestamp}` : asset.mux_playback_id;
                
                // Check if the specific token (using composite key) is missing
                if (!thumbnailTokens[tokenKey]) {
                    tokensToFetch.push({ 
                        playbackId: asset.mux_playback_id, 
                        timestamp // Now correctly number | undefined
                    });
                }
            }
        });

        tokensToFetch.forEach(({ playbackId, timestamp }) => {
            fetchThumbnailToken(playbackId, timestamp);
        });

    }, [assets, fetchThumbnailToken]);

    // Auto-dismiss processing notifications after 3 minutes
    useEffect(() => {
        const processingUploads = Object.entries(activeUploads).filter(([, upload]) => upload.status === 'processing');
        processingUploads.forEach(([uploadId, upload]) => {
            const elapsed = Date.now() - upload.startTime;
            const maxProcessingTime = 3 * 60 * 1000;
            if (elapsed > maxProcessingTime) {
                setActiveUploads(prev => {
                    const newUploads = { ...prev };
                    delete newUploads[uploadId];
                    return newUploads;
                });
            }
        });
    }, [activeUploads]);

    // Handler to toggle selection mode
    const handleToggleSelectionMode = useCallback(() => {
        setIsSelectionMode(prev => !prev);
        setSelectedAssets(new Set()); // Clear selection when toggling mode
    }, []);

    // Handler to open camera
    const handleAddNewAsset = useCallback(() => {
        setShowCamera(true);
    }, []);

    // Handler to close camera
    const handleCloseCamera = useCallback(() => {
        setShowCamera(false);
    }, []);

    // Handler to close media preview
    const handleCancelMediaPreview = useCallback(() => {
        setCapturedFile(null);
    }, []);

    // Handler to retry from media preview
    const handleRetryMediaPreview = useCallback(() => {
        setCapturedFile(null);
        setShowCamera(true);
    }, []);

    // Handler to close asset modal
    const handleCloseAssetModal = useCallback(() => {
        setSelectedAsset(null);
    }, []);

    // Handler for when asset is deleted from the modal
    // (Realtime updates handle the state change, but we need to close the modal)
    const handleAssetDeletedFromModal = useCallback((deletedAssetId: string) => {
        console.log(`[HANDLE ASSET DELETED FROM MODAL] Processing deletion of asset ${deletedAssetId}`);
        setSelectedAsset(null); // Close modal if the deleted asset was selected
        // Relying on realtime subscription to handle state updates
    }, []);


    return {
        // State
        showCamera,
        capturedFile,
        assets,
        totalItems,
        totalValue,
        selectedAsset,
        selectedAssets,
        isSelectionMode,
        isDeleting,
        mediaErrors,
        thumbnailTokens,
        activeUploads,

        // Handlers
        handleCapture,
        handleSave,
        handleBulkDelete,
        handleBulkAddTag,
        handleBulkRemoveTag,
        handleBulkToggleTag,
        handleBulkAssignRoom,
        handleBulkRemoveRoom,
        handleAssetClick,
        handleMediaError,
        handleRetryMedia,
        toggleAssetSelection,
        fetchThumbnailToken, // Expose if needed by AssetGrid/Card directly
        handleToggleSelectionMode,
        handleAddNewAsset,
        handleCloseCamera,
        handleCancelMediaPreview,
        handleRetryMediaPreview,
        handleCloseAssetModal,
        handleAssetDeletedFromModal,
        processClientSideAssetUpdate,
        fetchAndUpdateAssetState,
        getSelectedAssetsTagStatus,

        // Setters (usually not needed, but maybe for specific cases like closing modal)
        setThumbnailTokens, // Expose for thumbnail regeneration
    };
} 