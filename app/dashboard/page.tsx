// This is a Server Component by default (no 'use client' directive)
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { DashboardClient } from '@/components/dashboard-client'
import { Asset } from '@/types/asset'
import { redirect } from 'next/navigation'
import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { Suspense } from 'react'
import { type Asset as AssetType } from '@/types/asset'
import { AssetWithMuxData } from '@/types/mux'

// Use async/await for server-side data fetching
export default async function Dashboard() {
    // Create the Supabase client (it's an async function)
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return redirect('/login')
    }

    // Update DB if user's email is not in the database
    await ensureUserExists(user, supabase)

    // Get the user's assets
    const { data: assets, error } = await supabase
        .from('assets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching assets:', error)
    }

    // Transform assets to include absolute media_url if it's not a Mux video
    const transformedAssets = (assets || []).map((asset: any) => {
        // Check if this is a Mux video (has mux_asset_id)
        if ('mux_asset_id' in asset && asset.mux_asset_id) {
            // For Mux videos, the media_url is stored as empty until processing is complete
            return asset as AssetWithMuxData;
        }

        // For S3-stored assets, transform the media_url to include the full URL
        return {
            ...asset,
            media_url: asset.media_url.startsWith('http')
                ? asset.media_url
                : `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`
        } as AssetWithMuxData;
    });

    return (
        <Suspense fallback={<div>Loading...</div>}>
            <DashboardClient initialAssets={transformedAssets} user={user} />
        </Suspense>
    )
}

// Server-side function for user management
async function ensureUserExists(user: { id: string, email?: string | undefined }, supabase: SupabaseClient) {
    // Only proceed if the user has an email (some auth methods might not provide email)
    if (!user.email) return;

    // Check if user exists in our database
    const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

    // If user doesn't exist, create them
    if (!existingUser) {
        const { error } = await supabase
            .from('users')
            .insert({
                id: user.id,
                email: user.email,
            });

        if (error) {
            console.error('Error creating user:', error);
        }
    }
}