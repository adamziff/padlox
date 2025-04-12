/**
 * Supabase authentication clients for various contexts
 */
import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with service role for admin operations
 * Used only within secure server contexts (API routes, webhooks)
 */
export function createServiceSupabaseClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client')
  }
  
  // Use the standard createClient from @supabase/supabase-js for the service role
  // It doesn't require cookie handling options when used server-side with a service key.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    // No 'cookies' option needed here for the standard client
  )
}