// This is a Server Component by default (no 'use client' directive)
import { DashboardClient } from '@/components/dashboard-client'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Suspense } from 'react'
import { AssetWithMuxData } from '@/types/mux'
import { SupabaseClient } from '@supabase/supabase-js'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Dashboard | Padlox',
    description: 'Manage your home inventory.',
}

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
        return <div>Error loading dashboard data: {error.message}</div>
    }

    // Calculate metrics
    const filteredAssetsForCount = assets.filter(asset => asset.media_type === 'item' || asset.media_type === 'image');
    const totalItems = filteredAssetsForCount.length; // Count only items and images
    const totalValue = assets.reduce((sum: number, asset: AssetWithMuxData) => {
        // Ensure estimated_value is treated as a number, default to 0 if null/invalid
        const value = typeof asset.estimated_value === 'number' ? asset.estimated_value : 0
        return sum + value
    }, 0)

    // Transform assets to include absolute media_url if it's not a Mux video
    const transformedAssets = (assets || []).map((asset: AssetWithMuxData) => {
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
            <DashboardClient
                initialAssets={transformedAssets}
                initialTotalItems={totalItems}
                initialTotalValue={totalValue}
                user={user}
            />
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