import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

const tagNameSchema = z.object({
  name: z.string().min(1, { message: 'Tag name cannot be empty' }),
});

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: tags, error } = await supabase
      .from('tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching tags:', error.message);
      return NextResponse.json({ error: 'Failed to fetch tags', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: tags || [] }, { status: 200 });
  } catch (e: unknown) {
    console.error('Unexpected error fetching tags:', e instanceof Error ? e.message : 'Unknown error');
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

  const validationResult = tagNameSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
  }

  const { name } = validationResult.data;

  try {
    // Check for duplicate tag name for the user
    const { data: existingTag, error: existingTagError } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .maybeSingle();

    if (existingTagError && existingTagError.code !== 'PGRST116') { // PGRST116: No rows found, which is fine here
      console.error('Error checking for existing tag:', existingTagError.message);
      return NextResponse.json({ error: 'Failed to check for existing tag', details: existingTagError.message }, { status: 500 });
    }

    if (existingTag) {
      return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
    }

    // Create the new tag
    const { data: newTag, error: createError } = await supabase
      .from('tags')
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (createError) {
      console.error('Error creating tag:', createError.message);
      return NextResponse.json({ error: 'Failed to create tag', details: createError.message }, { status: 500 });
    }

    return NextResponse.json({ data: newTag }, { status: 201 });
  } catch (e: unknown) {
    console.error('Unexpected error creating tag:', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json({ error: 'An unexpected error occurred', details: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
