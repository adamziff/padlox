import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}

export function createServiceClient() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
    }

    // Create a Supabase client configured to use the service role key
    // This client bypasses RLS and should ONLY be used on the server.
    // It does not need cookie handling, but ssr requires the methods.
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            cookies: {
                // Provide dummy cookie methods to satisfy ssr types
                get(name: string) {
                    return undefined // Service client doesn't read cookies
                },
                set(name: string, value: string, options: CookieOptions) {
                    // Service client doesn't set cookies
                },
                remove(name: string, options: CookieOptions) {
                    // Service client doesn't remove cookies
                },
            },
            auth: {
                // Prevent client from trying to use cookies or storage
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    )
}