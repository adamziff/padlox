/**
 * Middleware for handling Supabase authentication
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Updates the session in the middleware
 * @param request - The incoming request
 */
export async function updateSession(request: NextRequest) {
  const url = request.nextUrl.pathname
  console.log(`[MIDDLEWARE] Processing request to: ${url}`)

  // Create a response object that we can modify
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create a Supabase client using the request/response objects
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: Record<string, unknown>) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh the user's session if needed
  const { data: { session }, error } = await supabase.auth.getSession()
  console.log(`[MIDDLEWARE] Session check for ${url}:`, {
    hasSession: !!session,
    hasUser: !!session?.user,
    error: error?.message
  })

  return response
}