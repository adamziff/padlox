/**
 * Compatibility helper for creating Supabase clients
 * This file provides backward compatibility for existing client-side code
 * while we transition to the new organization
 */
import { createBrowserClient } from '@supabase/ssr'

// For client components (browser)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// These functions are not actually used but provide a compatible API surface
// for code that expects them. They should eventually be migrated to use the
// specific imports from lib/auth/supabase.ts
export function createServerClient() {
  throw new Error('Use createServiceSupabaseClient() from lib/auth/supabase.ts instead')
}

export function createServiceClient() {
  throw new Error('Use createServiceSupabaseClient() from lib/auth/supabase.ts instead')
}