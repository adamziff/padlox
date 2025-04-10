import { MuxData } from './mux';

/**
 * Represents an asset (item or media file) stored in the database.
 * Corresponds to the 'assets' table.
 */
export interface Asset {
    id: string
    name: string
    description: string | null
    estimated_value: number | null
    media_url: string
    media_type: 'image' | 'video' | 'item'
    created_at: string
    user_id: string
    client_reference_id?: string
    mux_correlation_id?: string
    last_updated?: string
    is_source_video?: boolean
    source_video_id?: string | null
    item_timestamp?: number | null
    mux_asset_id?: string | null
    mux_playback_id?: string | null
    mux_processing_status?: 'preparing' | 'ready' | 'error' | null
    mux_max_resolution?: string | null
    mux_aspect_ratio?: string | null
    mux_duration?: number | null
    mux_audio_url?: string | null
    transcript?: any | null
    transcript_text?: string | null
    transcript_processing_status?: 'pending' | 'processing' | 'completed' | 'error' | null
    transcript_error?: string | null
    room_id?: string | null
    inferred_room_name?: string | null
    purchase_date?: string | null
    purchase_price?: number | null
    condition?: string | null
    serial_number?: string | null
    brand?: string | null
    model?: string | null
    notes?: string | null
    is_processed?: boolean
    updated_at: string
    file_type: 'image' | 'video'
    width?: number
    height?: number
    duration?: number
    mux_upload_id?: string
    mux_data?: MuxData | null
    processing_status?: 'pending' | 'processing' | 'completed' | 'failed' | null
} 