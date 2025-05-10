// Schema updates for real-time frame analysis
// Add these to your lib/db/schema.ts file

// Add to the Database interface under public.Tables
/**
 * scratch_items: Table for storing frame-by-frame analysis data
 */
export interface ScratchItemsTable {
  Row: {
    id: string
    asset_id: string
    captured_at: string
    caption: string | null
    image_url: string
    confidence: number | null
  }
  Insert: {
    id?: string
    asset_id: string
    captured_at?: string
    caption?: string | null
    image_url: string
    confidence?: number | null
  }
  Update: {
    id?: string
    asset_id?: string
    captured_at?: string
    caption?: string | null
    image_url?: string
    confidence?: number | null
  }
}

// Add these fields to your assets table interfaces (separate for Row, Insert, and Update)
export interface FrameAnalysisRowFields {
  frame_analysis_complete: boolean
  frame_analysis_started_at: string | null
  frame_analysis_completed_at: string | null
}

export interface FrameAnalysisInsertFields {
  frame_analysis_complete?: boolean
  frame_analysis_started_at?: string | null
  frame_analysis_completed_at?: string | null
}

export interface FrameAnalysisUpdateFields {
  frame_analysis_complete?: boolean
  frame_analysis_started_at?: string | null
  frame_analysis_completed_at?: string | null
}

// Add this to the Database.public.Functions interface
export interface FrameAnalysisFunctions {
  mark_frame_analysis_complete: {
    Args: {
      p_asset_id: string
    }
    Returns: void
  }
  initiate_frame_analysis: {
    Args: {
      p_asset_id: string
    }
    Returns: void
  }
}

/*
 * Integration instructions:
 *
 * 1. Add the ScratchItemsTable to your Database interface:
 *    public: {
 *      Tables: {
 *        users: {...},
 *        assets: {...},
 *        webhook_events: {...},
 *        broadcast: {...},
 *        scratch_items: ScratchItemsTable
 *      }
 *    }
 *
 * 2. Update your assets table interfaces to include the frame analysis fields:
 *    assets: {
 *      Row: {
 *        id: string,
 *        // existing fields...
 *        
 *        // Add these fields from FrameAnalysisRowFields:
 *        frame_analysis_complete: boolean
 *        frame_analysis_started_at: string | null
 *        frame_analysis_completed_at: string | null
 *      }
 *      Insert: {
 *        // existing fields...
 *        
 *        // Add these fields from FrameAnalysisInsertFields:
 *        frame_analysis_complete?: boolean
 *        frame_analysis_started_at?: string | null
 *        frame_analysis_completed_at?: string | null
 *      }
 *      Update: {
 *        // existing fields...
 *        
 *        // Add these fields from FrameAnalysisUpdateFields:
 *        frame_analysis_complete?: boolean
 *        frame_analysis_started_at?: string | null
 *        frame_analysis_completed_at?: string | null
 *      }
 *    }
 *
 * 3. Add the new functions to your Functions interface:
 *    Functions: {
 *      notify_transcript_ready: {...},
 *      process_static_rendition_webhooks: {...},
 *      mark_frame_analysis_complete: FrameAnalysisFunctions['mark_frame_analysis_complete'],
 *      initiate_frame_analysis: FrameAnalysisFunctions['initiate_frame_analysis'],
 *    }
 */ 