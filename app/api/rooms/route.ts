import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

const roomNameSchema = z.object({
  name: z.string().min(1, { message: 'Room name cannot be empty' }),
});

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching rooms:', error.message);
      return NextResponse.json({ error: 'Failed to fetch rooms', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: rooms || [] }, { status: 200 });
  } catch (e: unknown) {
    console.error('Unexpected error fetching rooms:', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json({ error: 'An unexpected error occurred', details: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e: unknown) {
    return NextResponse.json({ error: 'Invalid JSON body', details: e instanceof Error ? e.message : 'Unknown error' }, { status: 400 });
  }

  const validationResult = roomNameSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
  }

  const { name } = validationResult.data;

  try {
    // Check for duplicate room name for the user
    const { data: existingRoom, error: existingRoomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .maybeSingle();

    if (existingRoomError && existingRoomError.code !== 'PGRST116') { 
      console.error('Error checking for existing room:', existingRoomError.message);
      return NextResponse.json({ error: 'Failed to check for existing room', details: existingRoomError.message }, { status: 500 });
    }

    if (existingRoom) {
      return NextResponse.json({ error: 'A room with this name already exists' }, { status: 409 });
    }

    // Create the new room
    const { data: newRoom, error: createError } = await supabase
      .from('rooms')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (createError) {
      console.error('Error creating room:', createError.message);
      return NextResponse.json({ error: 'Failed to create room', details: createError.message }, { status: 500 });
    }

    return NextResponse.json({ data: newRoom }, { status: 201 });
  } catch (e: unknown) {
    console.error('Unexpected error creating room:', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json({ error: 'An unexpected error occurred', details: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
