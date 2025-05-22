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

    // Get the user's assets with tags and room
    // Note: Supabase syntax for fetching related data.
    // `tags` via `asset_tags` (many-to-many)
    // `rooms` via `asset_rooms` (one-to-one implied by unique asset_id in asset_rooms)
    const { data: assetsData, error } = await supabase
        .from('assets')
        .select(`
            *,
            asset_rooms(
                rooms(*)
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching assets with tags and room:', error);
        return <div>Error loading dashboard data: {error.message}</div>;
    }

    // The 'tags' will be an array of objects like [{id, name}, ...].
    // The 'rooms' field from the query `rooms (id, name)` might return an array with one item or null/empty array
    // if no room is associated. We want to transform it to a single object or null.
    const assetsWithProcessedRelations = (assetsData || []).map(asset => {
        const roomData = asset.rooms;
        // Ensure room is an object or null, not an array for one-to-one
        const room = Array.isArray(roomData) && roomData.length > 0 ? roomData[0] : null;
        return {
            ...asset,
            tags: asset.tags || [], // Ensure tags is always an array
            room: room,
        };
    });


    // Calculate metrics
    const filteredAssetsForCount = assetsWithProcessedRelations.filter(asset => asset.media_type === 'item' || asset.media_type === 'image');
    const totalItems = filteredAssetsForCount.length;
    const totalValue = assetsWithProcessedRelations.reduce((sum: number, asset: any) => { // Use 'any' for now, will be AssetWithMuxData
        const value = typeof asset.estimated_value === 'number' ? asset.estimated_value : 0;
        return sum + value;
    }, 0);

    // Transform assets to include absolute media_url if it's not a Mux video
    const transformedAssets = assetsWithProcessedRelations.map((asset: any) => { // Use 'any' for now
        if (asset.mux_asset_id) {
            return asset as AssetWithMuxData;
        }
        return {
            ...asset,
            media_url: asset.media_url && asset.media_url.startsWith('http')
                ? asset.media_url
                : `https://${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${asset.media_url}`,
        } as AssetWithMuxData;
    });

    return (
        <Suspense fallback={<div>Loading...</div>}>
            <DashboardClient
                initialAssets={transformedAssets as AssetWithMuxData[]}
                initialTotalItems={totalItems}
                initialTotalValue={totalValue}
                user={user}
            />
        </Suspense>
    )
}

// Server-side function for user management

const DEFAULT_TAG_NAMES = ["Electronics", "Furniture", "Jewelry", "Art", "Decor", "Clothing", "Documents", "Kitchenware", "Tools", "Sports Equipment"];
const DEFAULT_ROOM_NAMES = ["Living Room", "Master Bedroom", "Guest Bedroom", "Kitchen", "Dining Room", "Office", "Garage", "Basement", "Attic", "Storage Closet"];

async function ensureUserExists(user: { id: string, email?: string | undefined }, supabase: SupabaseClient) {
    // Only proceed if the user has an email (some auth methods might not provide email)
    if (!user.email) return;

    let userExists = false;

    // Check if user exists in our database
    const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116: 'No rows found'
        console.error('Error fetching user:', fetchError);
        // Potentially return or throw, depending on how critical this is.
        // For now, we'll try to proceed to user creation if appropriate.
    }

    if (existingUser) {
        userExists = true;
    } else {
        // If user doesn't exist, create them
        const { error: createError } = await supabase
            .from('users')
            .insert({
                id: user.id,
                email: user.email,
            });

        if (createError) {
            console.error('Error creating user:', createError);
            return; // If user creation fails, we can't proceed with tags/rooms
        }
        userExists = true; // User is now created
    }

    if (!userExists) {
        // Should not happen if user creation was successful or user already existed.
        console.error('User does not exist after check/creation attempt.');
        return;
    }

    // Check and create default tags if none exist
    try {
        const { data: existingTags, error: tagsError } = await supabase
            .from('tags')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

        if (tagsError) {
            console.error('Error checking for existing tags:', tagsError);
        } else if (!existingTags || existingTags.length === 0) {
            const tagsToInsert = DEFAULT_TAG_NAMES.map(name => ({ user_id: user.id, name }));
            const { error: insertTagsError } = await supabase.from('tags').insert(tagsToInsert);
            if (insertTagsError) {
                console.error('Error inserting default tags:', insertTagsError);
            } else {
                console.log(`Inserted default tags for user ${user.id}`);
            }
        }
    } catch (e) {
        console.error('Exception during default tag creation:', e);
    }

    // Check and create default rooms if none exist
    try {
        const { data: existingRooms, error: roomsError } = await supabase
            .from('rooms')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);

        if (roomsError) {
            console.error('Error checking for existing rooms:', roomsError);
        } else if (!existingRooms || existingRooms.length === 0) {
            const roomsToInsert = DEFAULT_ROOM_NAMES.map(name => ({ user_id: user.id, name }));
            const { error: insertRoomsError } = await supabase.from('rooms').insert(roomsToInsert);
            if (insertRoomsError) {
                console.error('Error inserting default rooms:', insertRoomsError);
            } else {
                console.log(`Inserted default rooms for user ${user.id}`);
            }
        }
    } catch (e) {
        console.error('Exception during default room creation:', e);
    }
}