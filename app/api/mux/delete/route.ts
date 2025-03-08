import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await request.json();

    if (!assetId) {
      return NextResponse.json({ error: 'Missing assetId' }, { status: 400 });
    }

    // Verify the user owns this asset
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, mux_asset_id')
      .eq('id', assetId)
      .eq('user_id', user.id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found or access denied' }, { status: 404 });
    }

    // If the asset has a Mux ID, delete it from Mux
    if (asset.mux_asset_id) {
      // Create Basic Auth credentials
      const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
      
      // Delete the asset from Mux
      const response = await fetch(`https://api.mux.com/video/v1/assets/${asset.mux_asset_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // We'll still try to delete from the database even if Mux deletion fails
        console.error(`Error deleting Mux asset ${asset.mux_asset_id}:`, response.status, response.statusText);
      }
    }

    // Delete the asset from the database
    const { error: deleteError } = await supabase
      .from('assets')
      .delete()
      .eq('id', assetId);

    if (deleteError) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 