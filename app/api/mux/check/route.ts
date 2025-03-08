import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if Mux credentials are configured
    if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
      return NextResponse.json({
        status: 'error',
        message: 'Mux credentials are not configured'
      }, { status: 500 });
    }
    
    // Create Basic Auth credentials
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64');
    
    // Make a simple API call to Mux to check credentials
    const response = await fetch('https://api.mux.com/video/v1/assets?limit=1', {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return NextResponse.json({
        status: 'error',
        message: `Mux API error: ${response.status} ${response.statusText}`,
        details: await response.text().catch(() => null)
      }, { status: 500 });
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      status: 'success',
      message: 'Mux credentials work correctly',
      assetsCount: data.data?.length || 0
    });
  } catch (error) {
    console.error('Error checking Mux credentials:', error);
    
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error checking Mux credentials'
    }, { status: 500 });
  }
} 