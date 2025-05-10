/**
 * Hook for managing real-time frame analysis state and subscriptions.
 * Provides access to frame analysis results as they arrive from the backend.
 */

import { useEffect, useState, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '@/lib/db/schema';
import type { ScratchItemsTable } from '@/lib/db/schema-update';

// Configure Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Type for scratch items, using the schema from schema-update.ts
export type ScratchItem = ScratchItemsTable['Row'];

interface UseFrameAnalysisOptions {
  /** Asset ID to subscribe to frame analysis for */
  assetId: string;
  /** Whether to automatically subscribe when the hook mounts */
  autoSubscribe?: boolean;
}

interface UseFrameAnalysisReturn {
  /** Array of scratch items from frame analysis */
  items: ScratchItem[];
  /** Whether frame analysis is currently active */
  isActive: boolean;
  /** Whether the initial load is complete */
  isLoaded: boolean;
  /** Any error that occurred during loading or subscription */
  error: Error | null;
  /** Start subscribing to frame analysis updates */
  subscribe: () => (() => void) | undefined;
  /** Stop subscribing to frame analysis updates */
  unsubscribe: () => void;
  /** Mark frame analysis as complete for this asset */
  markComplete: () => Promise<void>;
}

/**
 * Hook for managing real-time frame analysis state and subscriptions
 */
export function useFrameAnalysis({
  assetId,
  autoSubscribe = true,
}: UseFrameAnalysisOptions): UseFrameAnalysisReturn {
  const [items, setItems] = useState<ScratchItem[]>([]);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [channelName] = useState<string>(`scratch-items-${assetId}`);
  
  // Load initial items
  useEffect(() => {
    async function loadInitialItems() {
      try {
        // First check if frame analysis is complete
        const { data: assetData, error: assetError } = await supabase
          .from('assets')
          .select('frame_analysis_complete')
          .eq('id', assetId)
          .single();
        
        if (assetError) throw assetError;
        
        // Set active state based on whether analysis is complete
        setIsActive(!assetData?.frame_analysis_complete);
        
        // Load existing items
        const { data, error: itemsError } = await supabase
          .from('scratch_items')
          .select('*')
          .eq('asset_id', assetId)
          .order('captured_at', { ascending: true });
        
        if (itemsError) throw itemsError;
        
        // Update state with type assertion since schema is extending
        setItems(data as unknown as ScratchItem[] || []);
        setIsLoaded(true);
      } catch (err) {
        console.error('Failed to load initial frame analysis data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error loading frame data'));
        setIsLoaded(true);
      }
    }
    
    if (assetId) {
      loadInitialItems();
    }
  }, [assetId]);
  
  // Subscribe to realtime updates
  const subscribe = useCallback(() => {
    if (!assetId) return;
    
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'scratch_items',
          filter: `asset_id=eq.${assetId}` 
        }, 
        (payload) => {
          // Add new item to state with type assertion
          setItems(prev => [...prev, payload.new as unknown as ScratchItem]);
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'assets',
          filter: `id=eq.${assetId}`
        },
        (payload) => {
          // Check if frame analysis is complete
          if (payload.new && (payload.new as any).frame_analysis_complete) {
            setIsActive(false);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to frame analysis for asset: ${assetId}`);
        }
      });
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [assetId, channelName]);
  
  // Unsubscribe function
  const unsubscribe = useCallback(() => {
    const channel = supabase.channel(channelName);
    supabase.removeChannel(channel);
  }, [channelName]);
  
  // Auto-subscribe effect
  useEffect(() => {
    if (autoSubscribe && assetId) {
      const cleanup = subscribe();
      return () => {
        if (cleanup) cleanup();
      };
    }
  }, [autoSubscribe, assetId, subscribe]);
  
  // Mark frame analysis as complete
  const markComplete = useCallback(async () => {
    if (!assetId) {
      return;
    }
    
    try {
      const { error } = await supabase
        .rpc('mark_frame_analysis_complete', {
          p_asset_id: assetId
        });
      
      if (error) throw error;
      
      setIsActive(false);
    } catch (err) {
      console.error('Failed to mark frame analysis as complete:', err);
      setError(err instanceof Error ? err : new Error('Failed to mark frame analysis as complete'));
      throw err;
    }
  }, [assetId]);
  
  return {
    items,
    isActive,
    isLoaded,
    error,
    subscribe,
    unsubscribe,
    markComplete,
  };
} 