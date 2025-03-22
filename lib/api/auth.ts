/**
 * API authentication middleware
 */
import { createServerSupabaseClient } from '@/lib/auth/supabase'
import { unauthorizedResponse } from './response'

/**
 * Middleware to enforce authentication on API routes
 * Returns a function that takes the handler function
 */
import { User } from '@supabase/supabase-js'

export function withAuth<T extends (req: Request, ...rest: unknown[]) => Promise<Response>>(
  handler: T
) {
  return async (request: Request, ...rest: unknown[]): Promise<Response> => {
    try {
      // Use the new createServerSupabaseClient with proper cookie handling
      const supabase = await createServerSupabaseClient()
      
      // Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('Auth middleware: No user found')
        return unauthorizedResponse()
      }

      console.log('Auth middleware: User authenticated', { id: user.id, email: user.email })

      // Add the user to the request context
      const extendedRequest = request as Request & { user: User }
      Object.defineProperty(extendedRequest, 'user', {
        value: user,
        writable: false,
      })

      return handler(extendedRequest, ...rest)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return unauthorizedResponse()
    }
  }
}

/**
 * Extract the user from the request headers
 * Uses cookie-based authentication
 */
export async function getUserFromRequest() {
  try {
    // Use the new createServerSupabaseClient with proper cookie handling
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch (error) {
    console.error('Error getting user from request:', error)
    return null
  }
}