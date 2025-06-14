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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[DASHBOARD] Auth check:', { hasUser: !!user, error: authError?.message })

    if (!user) {
        console.log('[DASHBOARD] No user found, redirecting to login')
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
            ),
            asset_tags(
                tags(*)
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching assets with tags and room:', error);
        return <div>Error loading dashboard data: {error.message}</div>;
    }

    // The 'rooms' field from the query `asset_rooms(rooms(*))` should directly give the room object
    // or an empty array if no room is associated, due to the one-to-one nature enforced by UNIQUE(asset_id) on asset_rooms.
    const assetsWithProcessedRelations = (assetsData || []).map(asset => {
        // `asset.asset_rooms` from Supabase for `asset_rooms(rooms(*))` can be:
        // 1. An object like { rooms: { id: '...', name: '...' } } if a room is linked (as confirmed by logs).
        // 2. null if no room is linked.
        // 3. Potentially an empty array [] in some edge cases, though not observed for linked rooms.

        const roomDataFromSupabase = asset.asset_rooms;
        let room = null;

        if (roomDataFromSupabase && typeof roomDataFromSupabase === 'object' && !Array.isArray(roomDataFromSupabase) && roomDataFromSupabase.rooms) {
            // Handles the primary case observed in logs: asset_rooms is an object like { rooms: { ... } }
            room = roomDataFromSupabase.rooms;
        } else if (Array.isArray(roomDataFromSupabase) && roomDataFromSupabase.length > 0 && roomDataFromSupabase[0] && roomDataFromSupabase[0].rooms) {
            // Fallback for an array structure, e.g., [{ rooms: { ... } }]
            room = roomDataFromSupabase[0].rooms;
        }
        // If roomDataFromSupabase is null, an empty array, or an object without a .rooms property, room remains null.

        // Process tags from asset_tags
        const tagsData = asset.asset_tags as { tags: { id: string, name: string } }[]; // This will be an array of { tags: { id, name } }
        const tags = Array.isArray(tagsData) ? tagsData.map(at => at.tags).filter(tag => tag !== null && typeof tag === 'object') : [];

        return {
            ...asset,
            tags: tags,
            room: room, // Correctly assign the single room object or null
            // Remove the original join tables from the final object if they are large and not needed directly by client
            asset_rooms: undefined,
            asset_tags: undefined,
        };
    });

    // DEBUG: Log the processed rooms on the server
    // console.log("[app/dashboard/page.tsx] Assets after processing relations (sample of rooms):");
    // assetsWithProcessedRelations.slice(0, 5).forEach(a => {
    //     console.log(`  Asset ID: ${a.id}, Name: ${a.name}, Room: ${JSON.stringify(a.room)}`);
    // });

    // Calculate metrics
    const filteredAssetsForCount = assetsWithProcessedRelations.filter(asset => asset.media_type === 'item' || asset.media_type === 'image');
    const totalItems = filteredAssetsForCount.length;
    const totalValue = assetsWithProcessedRelations.reduce((sum: number, asset: AssetWithMuxData) => { // Use 'any' for now, will be AssetWithMuxData
        const value = typeof asset.estimated_value === 'number' ? asset.estimated_value : 0;
        return sum + value;
    }, 0);

    // Transform assets to include absolute media_url if it's not a Mux video
    const transformedAssets = assetsWithProcessedRelations.map((asset: AssetWithMuxData) => { // Use 'any' for now
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

const DEFAULT_TAG_NAMES = [
    "Electronics",
    "Furniture",
    "Jewelry",
    "Art",
    "Decor",
    "Clothing",
    "Kitchenware",
    "Tools",
    "Sports Equipment",
    "Personal Items",
];
const DEFAULT_ROOM_NAMES = [
    "Living Room",
    "Master Bedroom",
    "Guest Bedroom",
    "Master Bathroom",
    "Guest Bathroom",
    "Kitchen",
    "Dining Room",
    "Office",
    "Garage",
    "Basement",
    "Attic",
    "Storage Closet",
    "Porch",
];

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