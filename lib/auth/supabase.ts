/**
 * Supabase authentication clients for various contexts
 */
import { createServerClient } from '@supabase/ssr'

// Simple cookie handlers that satisfy the type system without actually using cookies
// This allows us to use the library with a simpler pattern for APIs
const emptyCookieHandlers = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  get: (_: string) => '',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  set: (_name: string, _value: string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  remove: (_: string) => {}
}

/**
 * Creates a Supabase client for server components
 * This is a simplified version that doesn't depend on persisting auth state
 */
export async function createServerSupabaseClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: emptyCookieHandlers
    }
  )
}

/**
 * Creates a Supabase client for server actions
 */
export async function createActionSupabaseClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: emptyCookieHandlers
    }
  )
}

/**
 * Creates a Supabase client with service role for admin operations
 * Used only within secure server contexts (API routes, webhooks)
 */
export function createServiceSupabaseClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client')
  }
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { 
      cookies: emptyCookieHandlers
    }
  )
}