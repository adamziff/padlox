/**
 * Compatibility helper for creating Supabase clients
 * This file exists to maintain backward compatibility with existing code
 * while we transition to the new organization in /lib/auth/supabase.ts
 */
import { createBrowserClient } from '@supabase/ssr'
import { createServerSupabaseClient, createServiceSupabaseClient } from './auth/supabase'

// For client components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// For server components
export function createServerClient() {
  return createServerSupabaseClient()
}

// For service operations (admin)
export function createServiceClient() {
  return createServiceSupabaseClient()
}