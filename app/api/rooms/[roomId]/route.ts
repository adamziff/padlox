import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

const roomNameSchema = z.object({
  name: z.string().min(1, { message: 'Room name cannot be empty' }),
});

interface RouteParams {
  params: {
    roomId: string;
  };
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const { roomId } = await params;

  if (!roomId) {
    return NextResponse.json({ error: 'Room ID is required' }, { status: 400 });
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

  const validationResult = roomNameSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
  }

  const { name } = validationResult.data;

  try {
    // Verify the room exists and belongs to the user
    const { data: existingRoom, error: fetchError } = await supabase
      .from('rooms')
      .select('id, user_id')
      .eq('id', roomId)
      .single();

    if (fetchError || !existingRoom) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (existingRoom.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check for duplicate room name for the user (excluding the current room being updated)
    const { data: duplicateRoom, error: duplicateCheckError } = await supabase
      .from('rooms')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .neq('id', roomId) // Exclude the current room
      .maybeSingle();

    if (duplicateCheckError && duplicateCheckError.code !== 'PGRST116') {
      console.error('Error checking for duplicate room name:', duplicateCheckError.message);
      return NextResponse.json({ error: 'Failed to check for duplicate room name', details: duplicateCheckError.message }, { status: 500 });
    }

    if (duplicateRoom) {
      return NextResponse.json({ error: 'A room with this name already exists' }, { status: 409 });
    }

    // Update the room
    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({ name })
      .eq('id', roomId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating room:', updateError.message);
      return NextResponse.json({ error: 'Failed to update room', details: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: updatedRoom }, { status: 200 });
  } catch (e: any) {
    console.error('Unexpected error updating room:', e.message);
    return NextResponse.json({ error: 'An unexpected error occurred', details: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const { roomId } = await params;

  if (!roomId) {
    return NextResponse.json({ error: 'Room ID is required' }, { status: 400 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Verify the room exists and belongs to the user
    const { data: existingRoom, error: fetchError } = await supabase
      .from('rooms')
      .select('id, user_id')
      .eq('id', roomId)
      .single();

    if (fetchError || !existingRoom) {
      if (fetchError && fetchError.code === 'PGRST116') {
        return new NextResponse(null, { status: 204 }); // Already deleted or doesn't exist
      }
      console.error('Error fetching room for deletion:', fetchError?.message);
      return NextResponse.json({ error: 'Room not found or error fetching it' }, { status: 404 });
    }

    if (existingRoom.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Delete associations from asset_rooms
    // RLS on asset_rooms should prevent unauthorized deletion if an asset does not belong to the user.
    // The main check is that the user owns the ROOM they are trying to delete.
    const { error: deleteAssetRoomsError } = await supabase
      .from('asset_rooms')
      .delete()
      .eq('room_id', roomId);

    if (deleteAssetRoomsError) {
      console.error('Error deleting room associations from asset_rooms:', deleteAssetRoomsError.message);
      return NextResponse.json({ error: 'Failed to delete room associations', details: deleteAssetRoomsError.message }, { status: 500 });
    }

    // 2. Delete the room itself
    const { error: deleteRoomError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .eq('user_id', user.id);

    if (deleteRoomError) {
      console.error('Error deleting room:', deleteRoomError.message);
      return NextResponse.json({ error: 'Failed to delete room', details: deleteRoomError.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    console.error('Unexpected error deleting room:', e.message);
    return NextResponse.json({ error: 'An unexpected error occurred', details: e.message }, { status: 500 });
  }
}
