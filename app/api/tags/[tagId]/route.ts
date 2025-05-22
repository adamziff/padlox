import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const tagNameSchema = z.object({
  name: z.string().min(1, { message: 'Tag name cannot be empty' }),
});

interface RouteParams {
  params: {
    tagId: string;
  };
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const { tagId } = params;

  if (!tagId) {
    return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
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

  const validationResult = tagNameSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
  }

  const { name } = validationResult.data;

  try {
    // Verify the tag exists and belongs to the user
    const { data: existingTag, error: fetchError } = await supabase
      .from('tags')
      .select('id, user_id')
      .eq('id', tagId)
      .single();

    if (fetchError || !existingTag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    if (existingTag.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check for duplicate tag name for the user (excluding the current tag being updated)
    const { data: duplicateTag, error: duplicateCheckError } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .neq('id', tagId) // Exclude the current tag from the check
      .maybeSingle();

    if (duplicateCheckError && duplicateCheckError.code !== 'PGRST116') {
      console.error('Error checking for duplicate tag name:', duplicateCheckError.message);
      return NextResponse.json({ error: 'Failed to check for duplicate tag name', details: duplicateCheckError.message }, { status: 500 });
    }

    if (duplicateTag) {
      return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
    }

    // Update the tag
    const { data: updatedTag, error: updateError } = await supabase
      .from('tags')
      .update({ name })
      .eq('id', tagId)
      .eq('user_id', user.id) // Ensure RLS is also respected at DB level
      .select()
      .single();

    if (updateError) {
      console.error('Error updating tag:', updateError.message);
      return NextResponse.json({ error: 'Failed to update tag', details: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: updatedTag }, { status: 200 });
  } catch (e: any) {
    console.error('Unexpected error updating tag:', e.message);
    return NextResponse.json({ error: 'An unexpected error occurred', details: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const { tagId } = params;

  if (!tagId) {
    return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Verify the tag exists and belongs to the user before attempting to delete
    const { data: existingTag, error: fetchError } = await supabase
      .from('tags')
      .select('id, user_id')
      .eq('id', tagId)
      .single();

    if (fetchError || !existingTag) {
      // If fetchError and code is PGRST116 (Not Found), it means the tag doesn't exist.
      // This is effectively the same as already deleted, so return 204.
      if (fetchError && fetchError.code === 'PGRST116') {
        return new NextResponse(null, { status: 204 });
      }
      console.error('Error fetching tag for deletion:', fetchError?.message);
      return NextResponse.json({ error: 'Tag not found or error fetching it' }, { status: 404 });
    }

    if (existingTag.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Supabase transactions are not easily available in edge functions.
    // Perform operations sequentially and handle potential partial failures if necessary.
    // 1. Delete associations from asset_tags
    const { error: deleteAssetTagsError } = await supabase
      .from('asset_tags')
      .delete()
      .eq('tag_id', tagId);
      // RLS on asset_tags should ensure user owns the assets linked to their tags,
      // but direct check on tag ownership is primary here.

    if (deleteAssetTagsError) {
      console.error('Error deleting tag associations from asset_tags:', deleteAssetTagsError.message);
      return NextResponse.json({ error: 'Failed to delete tag associations', details: deleteAssetTagsError.message }, { status: 500 });
    }

    // 2. Delete the tag itself
    const { error: deleteTagError } = await supabase
      .from('tags')
      .delete()
      .eq('id', tagId)
      .eq('user_id', user.id); // Ensure RLS is also respected

    if (deleteTagError) {
      console.error('Error deleting tag:', deleteTagError.message);
      return NextResponse.json({ error: 'Failed to delete tag', details: deleteTagError.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    console.error('Unexpected error deleting tag:', e.message);
    return NextResponse.json({ error: 'An unexpected error occurred', details: e.message }, { status: 500 });
  }
}
