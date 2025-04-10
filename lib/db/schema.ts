export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

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
                    // New fields from migration 20250409
                    updated_at: string // TIMESTAMPTZ (Added explicitly, was missing?)
                    room_id: string | null // UUID references rooms(id)
                    inferred_room_name: string | null
                    purchase_date: string | null // DATE (YYYY-MM-DD string)
                    purchase_price: number | null // DECIMAL(10,2)
                    condition: string | null
                    serial_number: string | null
                    brand: string | null
                    model: string | null
                    notes: string | null
                    is_processed: boolean // Default false
                    // Added missing file fields based on types/asset.ts 
                    width: number | null
                    height: number | null
                    client_reference_id: string | null
                    mux_upload_id: string | null 
                    processing_status: 'pending' | 'processing' | 'completed' | 'failed' | null // General status
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
                    // New fields from migration 20250409
                    updated_at?: string // TIMESTAMPTZ
                    room_id?: string | null
                    inferred_room_name?: string | null
                    purchase_date?: string | null
                    purchase_price?: number | null
                    condition?: string | null
                    serial_number?: string | null
                    brand?: string | null
                    model?: string | null
                    notes?: string | null
                    is_processed?: boolean // Default false
                    width?: number | null
                    height?: number | null
                    client_reference_id?: string | null
                    mux_upload_id?: string | null
                    processing_status?: 'pending' | 'processing' | 'completed' | 'failed' | null
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
                    // New fields from migration 20250409
                    updated_at?: string // TIMESTAMPTZ
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
                    width?: number | null
                    height?: number | null
                    client_reference_id?: string | null
                    mux_upload_id?: string | null
                    processing_status?: 'pending' | 'processing' | 'completed' | 'failed' | null
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
            rooms: {
                Row: {
                    id: string // UUID
                    user_id: string // UUID references auth.users
                    name: string
                    description: string | null
                    created_at: string // TIMESTAMPTZ
                    updated_at: string // TIMESTAMPTZ
                    inferred: boolean // Default false
                    merged_into: string | null // UUID references rooms(id)
                }
                Insert: {
                    id?: string // UUID
                    user_id: string // UUID references auth.users
                    name: string
                    description?: string | null
                    created_at?: string // TIMESTAMPTZ
                    updated_at?: string // TIMESTAMPTZ
                    inferred?: boolean // Default false
                    merged_into?: string | null // UUID references rooms(id)
                }
                Update: {
                    id?: string // UUID
                    user_id?: string // UUID references auth.users
                    name?: string
                    description?: string | null
                    created_at?: string // TIMESTAMPTZ
                    updated_at?: string // TIMESTAMPTZ
                    inferred?: boolean
                    merged_into?: string | null // UUID references rooms(id)
                }
            }
            tags: {
                Row: {
                    id: string // UUID
                    name: string // Unique
                    created_at: string // TIMESTAMPTZ
                }
                Insert: {
                    id?: string // UUID
                    name: string // Unique
                    created_at?: string // TIMESTAMPTZ
                }
                Update: {
                    id?: string // UUID
                    name?: string // Unique
                    created_at?: string // TIMESTAMPTZ
                }
            }
            user_tags: {
                Row: {
                    user_id: string // UUID references auth.users
                    tag_id: string // UUID references tags(id)
                    color: string | null
                    is_default: boolean // Default false
                    created_at: string // TIMESTAMPTZ
                }
                Insert: {
                    user_id: string
                    tag_id: string
                    color?: string | null
                    is_default?: boolean // Default false
                    created_at?: string // TIMESTAMPTZ
                }
                Update: {
                    user_id?: string
                    tag_id?: string
                    color?: string | null
                    is_default?: boolean
                    created_at?: string // TIMESTAMPTZ
                }
            }
            item_tags: {
                Row: {
                    item_id: string // UUID references assets(id)
                    tag_id: string // UUID references tags(id)
                    created_at: string // TIMESTAMPTZ
                }
                Insert: {
                    item_id: string
                    tag_id: string
                    created_at?: string // TIMESTAMPTZ
                }
                Update: {
                    item_id?: string
                    tag_id?: string
                    created_at?: string // TIMESTAMPTZ
                }
            }
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
            add_user_tag: {
                Args: {
                    p_user_id: string // UUID
                    p_tag_name: string
                    p_color?: string | null
                }
                Returns: string // UUID (the tag_id)
            }
        }
    }
}
