/**
 * Supabase authentication clients for various contexts
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type CookieOptions } from '@supabase/ssr'

/**
 * Creates a Supabase client for server components
 * This properly reads cookies to maintain the user's session
 */
export async function createServerSupabaseClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: {
        get: async (name: string) => {
          const cookieStore = await cookies()
          return cookieStore.get(name)?.value
        },
        set: async (name: string, value: string, options: CookieOptions) => {
          try {
            const cookieStore = await cookies()
            cookieStore.set(name, value, options)
          } catch (e) {
            console.log('Cookie set error (safe to ignore):', e)
          }
        },
        remove: async (name: string, options: CookieOptions) => {
          try {
            const cookieStore = await cookies()
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          } catch (e) {
            console.log('Cookie remove error (safe to ignore):', e)
          }
        }
      }
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
      cookies: {
        get: async (name: string) => {
          const cookieStore = await cookies()
          return cookieStore.get(name)?.value
        },
        set: async (name: string, value: string, options: CookieOptions) => {
          try {
            const cookieStore = await cookies()
            cookieStore.set(name, value, options)
          } catch (e) {
            console.log('Action cookie set error (safe to ignore):', e)
          }
        },
        remove: async (name: string, options: CookieOptions) => {
          try {
            const cookieStore = await cookies()
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          } catch (e) {
            console.log('Action cookie remove error (safe to ignore):', e)
          }
        }
      }
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