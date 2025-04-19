// This is a Server Component by default (no 'use client' directive)
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { DashboardClient } from '@/components/dashboard-client'
import { Asset } from '@/types/asset'
import { AssetWithMuxData } from '@/types/mux'
import { redirect } from 'next/navigation'
import { SupabaseClient } from '@supabase/supabase-js'

// Use async/await for server-side data fetching
export default async function Dashboard() {
    // Create the Supabase client with cookies for server-side authentication
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )

    // Get the current user server-side
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        // Handle unauthenticated users with a redirect
        redirect('/login')
    }

    // Ensure user exists in the database
    try {
        await ensureUserExists(user, supabase)
    } catch (error) {
        console.error('Failed to ensure user exists:', error)
        redirect('/login')
    }

    // Fetch assets server-side
    const { data: assets, error } = await supabase
        .from('assets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error loading assets:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
        })
        // You could handle this error by returning a specific UI or redirecting
    }

    // Transform the assets to align types with AssetWithMuxData
    const transformedAssets = assets?.map((asset: Asset): AssetWithMuxData => {
        // Explicitly map fields, converting nulls to undefined where necessary
        return {
            id: asset.id,
            user_id: asset.user_id,
            name: asset.name,
            description: asset.description,
            media_type: asset.media_type,
            media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`,
            created_at: asset.created_at,
            client_reference_id: asset.client_reference_id === null ? undefined : asset.client_reference_id,
            is_source_video: asset.is_source_video === null ? undefined : asset.is_source_video,
            source_video_id: asset.source_video_id === null ? undefined : asset.source_video_id,
            item_timestamp: asset.item_timestamp === null ? undefined : asset.item_timestamp,
            estimated_value: asset.estimated_value,
            // Mux specific fields
            mux_asset_id: asset.mux_asset_id === null ? undefined : asset.mux_asset_id,
            mux_playback_id: asset.mux_playback_id === null ? undefined : asset.mux_playback_id,
            mux_max_resolution: asset.mux_max_resolution === null ? undefined : asset.mux_max_resolution,
            mux_processing_status: asset.mux_processing_status === null ? undefined : asset.mux_processing_status,
            mux_aspect_ratio: asset.mux_aspect_ratio === null ? undefined : asset.mux_aspect_ratio,
            mux_duration: asset.mux_duration === null ? undefined : asset.mux_duration,
            mux_audio_url: asset.mux_audio_url === null ? undefined : asset.mux_audio_url,
            // Transcript specific fields
            transcript: asset.transcript === null ? undefined : asset.transcript,
            transcript_text: asset.transcript_text === null ? undefined : asset.transcript_text,
            transcript_processing_status: asset.transcript_processing_status === null ? undefined : asset.transcript_processing_status,
            transcript_error: asset.transcript_error === null ? undefined : asset.transcript_error,
        };
    }) || []

    // --- Calculate totalItems and totalValue --- 
    const totalItems = transformedAssets.length;
    const totalValue = transformedAssets.reduce((sum, asset) => {
        // Ensure estimated_value is treated as a number, default to 0 if null/invalid
        const value = typeof asset.estimated_value === 'number' ? asset.estimated_value : 0;
        return sum + value;
    }, 0);
    // --- End Calculation ---

    // Pass the pre-fetched data and calculated values to the client component
    return <DashboardClient
        initialAssets={transformedAssets}
        user={user}
        totalItems={totalItems}
        totalValue={totalValue}
    />
}

// Server-side function for user management
async function ensureUserExists(user: { id: string, email?: string | undefined }, supabase: SupabaseClient) {
    try {
        // First check if user exists
        const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single()

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" error
            console.error('Error checking for existing user:', {
                message: fetchError.message,
                details: fetchError.details,
                hint: fetchError.hint,
                code: fetchError.code
            })
            throw fetchError
        }

        // If user doesn't exist, create them
        if (!existingUser) {
            if (!user.email) {
                console.error('Cannot create user: email is required')
                throw new Error('User email is required')
            }

            // Use the same supabase instance for creating the user
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert([{
                    id: user.id,
                    email: user.email,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single()

            if (insertError) {
                console.error('Error creating user:', {
                    message: insertError.message,
                    details: insertError.details,
                    hint: insertError.hint,
                    code: insertError.code
                })
                throw insertError
            }

            console.log('Successfully created new user:', newUser)
            return newUser
        }

        console.log('User already exists:', existingUser)
        return existingUser
    } catch (error: unknown) {
        const err = error as Error & {
            details?: string
            hint?: string
            code?: string
        }
        console.error('Error in ensureUserExists:', {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
            stack: err?.stack
        })
        throw err
    }
}