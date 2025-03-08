export interface Asset {
    id: string
    name: string
    description: string | null
    estimated_value: number | null
    media_url: string
    media_type: 'image' | 'video'
    created_at: string
    user_id: string
    client_reference_id?: string
    mux_correlation_id?: string
    last_updated?: string
} 