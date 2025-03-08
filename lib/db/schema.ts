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
                    user_id: string
                    name: string
                    description: string | null
                    estimated_value: number | null
                    media_url: string
                    media_type: 'image' | 'video'
                    is_signed: boolean
                    signature_data: Json | null
                    // Mux specific fields
                    mux_asset_id: string | null
                    mux_playback_id: string | null
                    mux_processing_status: 'preparing' | 'ready' | 'error' | null
                    mux_max_resolution: string | null
                    mux_aspect_ratio: string | null
                    mux_duration: number | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id: string
                    name: string
                    description?: string | null
                    estimated_value?: number | null
                    media_url: string
                    media_type: 'image' | 'video'
                    is_signed?: boolean
                    signature_data?: Json | null
                    // Mux specific fields
                    mux_asset_id?: string | null
                    mux_playback_id?: string | null
                    mux_processing_status?: 'preparing' | 'ready' | 'error' | null
                    mux_max_resolution?: string | null
                    mux_aspect_ratio?: string | null
                    mux_duration?: number | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    estimated_value?: number | null
                    media_url?: string
                    media_type?: 'image' | 'video'
                    is_signed?: boolean
                    signature_data?: Json | null
                    // Mux specific fields
                    mux_asset_id?: string | null
                    mux_playback_id?: string | null
                    mux_processing_status?: 'preparing' | 'ready' | 'error' | null
                    mux_max_resolution?: string | null
                    mux_aspect_ratio?: string | null
                    mux_duration?: number | null
                }
            }
        }
    }
}
