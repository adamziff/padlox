export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

/**
 * scratch_items: Table for storing frame-by-frame analysis data
 */
export interface ScratchItemsTable {
    Row: {
        id: string
        session_id: string
        captured_at: string
        caption: string | null
        description: string | null
        category: string | null
        estimated_value: number | null
        image_url: string
        confidence: number | null
        bounding_box: Json | null
        sequence_order: number | null
    }
    Insert: {
        id?: string
        session_id: string
        captured_at?: string
        caption?: string | null
        description?: string | null
        category?: string | null
        estimated_value?: number | null
        image_url: string
        confidence?: number | null
        bounding_box?: Json | null
        sequence_order?: number | null
    }
    Update: {
        id?: string
        session_id?: string
        captured_at?: string
        caption?: string | null
        description?: string | null
        category?: string | null
        estimated_value?: number | null
        image_url?: string
        confidence?: number | null
        bounding_box?: Json | null
        sequence_order?: number | null
    }
}

export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string  // references auth.users
                    email: string
                    created_at: string
                    display_name: string | null
                    avatar_url: string | null
                    phone_number: string | null
                    address: string | null
                    updated_at: string
                }
                Insert: {
                    id: string  // references auth.users
                    email: string
                    created_at?: string
                    display_name?: string | null
                    avatar_url?: string | null
                    phone_number?: string | null
                    address?: string | null
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    created_at?: string
                    display_name?: string | null
                    avatar_url?: string | null
                    phone_number?: string | null
                    address?: string | null
                    updated_at?: string
                }
            }
            assets: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string // references auth.users
                    name: string
                    description: string | null
                    estimated_value: number | null
                    media_url: string
                    media_type: 'image' | 'video' | 'item' // Added 'item'
                    is_signed: boolean
                    signature_data: Json | null
                    // Mux specific fields
                    mux_asset_id: string | null
                    mux_playback_id: string | null
                    mux_processing_status: 'preparing' | 'ready' | 'error' | null
                    mux_max_resolution: string | null
                    mux_aspect_ratio: string | null
                    mux_duration: number | null
                    mux_audio_url: string | null // Added mux_audio_url
                    // Transcript fields
                    transcript: Json | null // Assuming Deepgram JSON structure
                    transcript_text: string | null // Plain text version
                    transcript_processing_status: 'pending' | 'processing' | 'completed' | 'error' | null // Added status
                    transcript_error: string | null // Added error message field
                    // Item specific fields
                    is_source_video: boolean // Added flag for source video vs item
                    source_video_id: string | null // Added link to source video asset
                    item_timestamp: number | null // Added timestamp for items
                    is_processed: boolean // Added flag for overall processing status
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id: string // references auth.users
                    name: string
                    description?: string | null
                    estimated_value?: number | null
                    media_url: string
                    media_type: 'image' | 'video' | 'item' // Added 'item'
                    is_signed?: boolean
                    signature_data?: Json | null
                    // Mux specific fields
                    mux_asset_id?: string | null
                    mux_playback_id?: string | null
                    mux_processing_status?: 'preparing' | 'ready' | 'error' | null
                    mux_max_resolution?: string | null
                    mux_aspect_ratio?: string | null
                    mux_duration?: number | null
                    mux_audio_url?: string | null // Added mux_audio_url
                    // Transcript fields
                    transcript?: Json | null
                    transcript_text?: string | null
                    transcript_processing_status?: 'pending' | 'processing' | 'completed' | 'error' | null // Added status
                    transcript_error?: string | null // Added error message field
                    // Item specific fields
                    is_source_video?: boolean // Default should be handled by DB or logic
                    source_video_id?: string | null
                    item_timestamp?: number | null
                    is_processed?: boolean // Added flag for overall processing status
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string // references auth.users
                    name?: string
                    description?: string | null
                    estimated_value?: number | null
                    media_url?: string
                    media_type?: 'image' | 'video' | 'item' // Added 'item'
                    is_signed?: boolean
                    signature_data?: Json | null
                    // Mux specific fields
                    mux_asset_id?: string | null
                    mux_playback_id?: string | null
                    mux_processing_status?: 'preparing' | 'ready' | 'error' | null
                    mux_max_resolution?: string | null
                    mux_aspect_ratio?: string | null
                    mux_duration?: number | null
                    mux_audio_url?: string | null // Added mux_audio_url
                    // Transcript fields
                    transcript?: Json | null
                    transcript_text?: string | null
                    transcript_processing_status?: 'pending' | 'processing' | 'completed' | 'error' | null // Added status
                    transcript_error?: string | null // Added error message field
                    // Item specific fields
                    is_source_video?: boolean
                    source_video_id?: string | null
                    item_timestamp?: number | null
                    is_processed?: boolean // Added flag for overall processing status
                }
            }
            webhook_events: {
                Row: {
                    id: number
                    created_at: string
                    event_type: string
                    event_id: string
                    payload: Json
                    processed: boolean
                    processed_at: string | null
                    mux_asset_id: string | null
                    mux_upload_id: string | null
                    mux_correlation_id: string | null
                    asset_id: string | null // Link to our assets table
                }
                Insert: {
                    id?: number
                    created_at?: string
                    event_type: string
                    event_id: string
                    payload: Json
                    processed?: boolean
                    processed_at?: string | null
                    mux_asset_id?: string | null
                    mux_upload_id?: string | null
                    mux_correlation_id?: string | null
                    asset_id?: string | null
                }
                Update: {
                    id?: number
                    created_at?: string
                    event_type?: string
                    event_id?: string
                    payload?: Json
                    processed?: boolean
                    processed_at?: string | null
                    mux_asset_id?: string | null
                    mux_upload_id?: string | null
                    mux_correlation_id?: string | null
                    asset_id?: string | null
                }
            }
            broadcast: {
                Row: {
                    id: number
                    created_at: string
                    channel: string
                    event: string
                    payload: Json
                }
                Insert: {
                    id?: number
                    created_at?: string
                    channel: string
                    event: string
                    payload: Json
                }
                Update: {
                     id?: number
                    created_at?: string
                    channel?: string
                    event?: string
                    payload?: Json
                }
            }
            scratch_items: ScratchItemsTable
        }
        Functions: {
            notify_transcript_ready: {
                Args: {
                    asset_id: string
                }
                Returns: {
                    success: boolean
                    message: string
                }
            }
            process_static_rendition_webhooks: {
                Args: Record<string, never> // No arguments expected
                Returns: void // Or define return type if needed
            }
        }
    }
}
