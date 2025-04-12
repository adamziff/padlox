/**
 * Supabase authentication clients for various contexts
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type CookieOptions } from '@supabase/ssr'

/**
 * Creates a Supabase client with service role for admin operations
 * Used only within secure server contexts (API routes, webhooks)
 */
export function createServiceSupabaseClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client')
  }
  
  // For service client, we don't actually need cookies since we're using the service role
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { 
      // Service client doesn't need to handle cookies since it's not user-bound
      cookies: {
        get: () => '',
        set: () => {},
        remove: () => {}
      }
    }
  )
}