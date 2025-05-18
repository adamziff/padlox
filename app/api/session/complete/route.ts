/**
 * API route for marking a session as complete with scratch item processing
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/db/schema';

// Configure Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, scratchDone } = await req.json();
    
    if (!sessionId) {
      return Response.json({ error: 'Missing session ID' }, { status: 400 });
    }
    
    // Update session
    const { error } = await supabase
      .from('sessions')
      .update({ scratch_done: scratchDone === true })
      .eq('id', sessionId);
    
    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error completing session:', error);
    return Response.json(
      { error: 'Failed to complete session', message: (error as Error).message },
      { status: 500 }
    );
  }
} 