import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const assetRoomSchema = z.object({
  room_id: z.string().uuid({ message: 'Invalid Room ID format' }),
});

// Schema for allowing null to remove a room, if desired for POST/PUT
const assetRoomOptionalSchema = z.object({
  room_id: z.string().uuid({ message: 'Invalid Room ID format' }).nullable(),
});

interface RouteParams {
  params: {
    assetId: string;
  };
}

// POST to assign or update a room for an asset (upsert behavior)
export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const { assetId } = await params;

  if (!assetId) {
    return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ error: 'Invalid JSON body', details: e.message }, { status: 400 });
  }

  // Using optional schema if you want to allow setting room_id to null via POST
  // For now, let's assume room_id is mandatory for a POST/PUT to assign/update.
  const validationResult = assetRoomSchema.safeParse(body); 
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
  }

  const { room_id } = validationResult.data;

  try {
    // 1. Verify asset exists and belongs to the user
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, user_id')
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    if (asset.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Asset does not belong to the user' }, { status: 403 });
    }

    // 2. Verify room exists and belongs to the user
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, user_id')
      .eq('id', room_id)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    if (room.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Room does not belong to the user' }, { status: 403 });
    }

    // 3. Upsert the association
    // The `asset_rooms` table has a UNIQUE constraint on `asset_id`, so an `upsert` is appropriate.
    const { data: newAssetRoom, error: upsertError } = await supabase
      .from('asset_rooms')
      .upsert({ asset_id: assetId, room_id: room_id }, { onConflict: 'asset_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error associating room with asset:', upsertError.message);
      return NextResponse.json({ error: 'Failed to associate room with asset', details: upsertError.message }, { status: 500 });
    }

    // Determine if it was a create (201) or update (200)
    // This is a bit tricky without knowing the previous state directly from the upsert result.
    // For simplicity, we can return 200 OK if the operation was successful.
    // Or, if newAssetRoom.created_at is very recent, assume 201 (heuristic).
    // Supabase upsert doesn't directly tell if it inserted or updated in a simple way.
    // Let's return 200 OK for successful association or update.
    return NextResponse.json({ data: newAssetRoom }, { status: 200 });

  } catch (e: any) {
    console.error('Unexpected error associating room with asset:', e.message);
    return NextResponse.json({ error: 'An unexpected error occurred', details: e.message }, { status: 500 });
  }
}

// DELETE to remove a room association from an asset
export async function DELETE(req: NextRequest, { params: paramsPromise }: RouteParams) {
  const supabase = await createClient();
  const params = await paramsPromise; // Await the params
  const { assetId } = params;

  if (!assetId) {
    return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Verify asset exists and belongs to the user (optional but good practice)
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, user_id')
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      // If asset not found, the association effectively doesn't exist.
      return new NextResponse(null, { status: 204 });
    }
    if (asset.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Asset does not belong to the user' }, { status: 403 });
    }

    // 2. Delete the association
    // RLS on asset_rooms ensures user can only delete if they own the asset.
    const { error: deleteError, count } = await supabase
      .from('asset_rooms')
      .delete()
      .eq('asset_id', assetId); // No need to specify room_id, as an asset can only be in one room.

    if (deleteError) {
      console.error('Error removing room association from asset:', deleteError.message);
      return NextResponse.json({ error: 'Failed to remove room from asset', details: deleteError.message }, { status: 500 });
    }

    // if (count === 0) {
      // This could mean the association didn't exist, which is fine for a DELETE.
    // }

    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    console.error('Unexpected error removing room from asset:', e.message);
    return NextResponse.json({ error: 'An unexpected error occurred', details: e.message }, { status: 500 });
  }
}
