import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

const assetTagSchema = z.object({
  tag_id: z.string().uuid({ message: 'Invalid Tag ID format' }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
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
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Invalid JSON body', details: errorMessage }, { status: 400 });
  }

  const validationResult = assetTagSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
  }

  const { tag_id } = validationResult.data;

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

    // 2. Verify tag exists and belongs to the user
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id, user_id')
      .eq('id', tag_id)
      .single();

    if (tagError || !tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }
    if (tag.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Tag does not belong to the user' }, { status: 403 });
    }

    // 3. Create the association
    const { data: newAssetTag, error: createError } = await supabase
      .from('asset_tags')
      .insert({ asset_id: assetId, tag_id: tag_id })
      .select()
      .single();

    if (createError) {
      // Handle potential duplicate entry if the association already exists
      if (createError.code === '23505') { // Unique violation
        return NextResponse.json({ error: 'Tag is already associated with this asset' }, { status: 409 });
      }
      console.error('Error creating asset-tag association:', createError.message);
      return NextResponse.json({ error: 'Failed to associate tag with asset', details: createError.message }, { status: 500 });
    }

    return NextResponse.json({ data: newAssetTag }, { status: 201 });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('Unexpected error associating tag with asset:', errorMessage);
    return NextResponse.json({ error: 'An unexpected error occurred', details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
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
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Invalid JSON body', details: errorMessage }, { status: 400 });
  }
  
  const validationResult = assetTagSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json({ error: 'Invalid request body: missing or invalid tag_id', details: validationResult.error.flatten() }, { status: 400 });
  }
  
  const { tag_id } = validationResult.data;


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
    // RLS on asset_tags will ensure that users can only delete associations
    // if they own the asset AND the tag. The check above for asset ownership is an explicit layer.
    const { error: deleteError } = await supabase
      .from('asset_tags')
      .delete()
      .eq('asset_id', assetId)
      .eq('tag_id', tag_id);

    if (deleteError) {
      console.error('Error deleting asset-tag association:', deleteError.message);
      return NextResponse.json({ error: 'Failed to remove tag from asset', details: deleteError.message }, { status: 500 });
    }

    // if (count === 0) {
      // This could mean the association didn't exist, which is fine for a DELETE.
      // Consider if a 404 is more appropriate if the client expects the link to exist.
      // For now, 204 is generally acceptable.
    // }

    return new NextResponse(null, { status: 204 });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('Unexpected error removing tag from asset:', errorMessage);
    return NextResponse.json({ error: 'An unexpected error occurred', details: errorMessage }, { status: 500 });
  }
}
