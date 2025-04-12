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
    mux_processing_status?: 'preparing' | 'processing' | 'ready' | 'error' | null
    mux_max_resolution?: string | null
    mux_aspect_ratio?: string | null
    mux_duration?: number | null
    mux_audio_url?: string | null
    transcript?: any | null
    transcript_text?: string | null
    transcript_processing_status?: 'pending' | 'processing' | 'completed' | 'error' | null
    transcript_error?: string | null
} 