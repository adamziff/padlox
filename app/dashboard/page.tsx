// This is a Server Component by default (no 'use client' directive)
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { DashboardClient } from '@/components/dashboard-client'
import { Asset } from '@/types/asset'
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

    // Transform the assets to use the correct S3 URL format
    const transformedAssets = assets?.map((asset: Asset) => ({
        ...asset,
        media_url: `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`
    })) || []

    // Pass the pre-fetched data to the client component
    return <DashboardClient initialAssets={transformedAssets} user={user} />
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