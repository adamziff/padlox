/**
 * API authentication middleware
 */
import { createClient } from '@/utils/supabase/server'
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
      let user = null;
      
      // Check for server API key in Authorization header (Bearer token)
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // Check if the token matches the API secret key for server-to-server auth
        if (token === process.env.API_SECRET_KEY) {
          console.log('Auth middleware: Authenticated via API key');
          // Create a system user for server-to-server calls
          user = {
            id: 'system',
            email: 'system@padlox.io',
            role: 'service',
            app_metadata: { provider: 'api_key' },
            user_metadata: {}
          } as User;
        }
      }
      
      // If not authenticated via API key, try cookie-based authentication
      if (!user) {
        // Use the client that handles cookies/user sessions
        const supabase = await createClient();
        
        // Get the authenticated user
        const { data: { user: cookieUser } } = await supabase.auth.getUser();
        user = cookieUser;
      }

      if (!user) {
        console.log('Auth middleware: No user found');
        return unauthorizedResponse();
      }

      console.log('Auth middleware: User authenticated', { id: user.id, email: user.email });

      // Add the user to the request context
      const extendedRequest = request as Request & { user: User };
      Object.defineProperty(extendedRequest, 'user', {
        value: user,
        writable: false,
      });

      return handler(extendedRequest, ...rest);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return unauthorizedResponse();
    }
  };
}

/**
 * Extract the user from the request headers
 * Uses cookie-based authentication
 */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  // Use the client that handles cookies/user sessions
  const supabase = await createClient()
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('Error getting user from request:', error);
    return null;
  }
}

export async function requireUser(req: Request): Promise<User> {
    // Use the client that handles cookies/user sessions
    const supabase = await createClient()
    try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error // Rethrow Supabase client errors
        if (!user) {
            // Throw an error if the user is not found, fulfilling the Promise<User> contract
            throw new Error('User not authenticated') 
        }
        return user // Now guaranteed to be non-null
    } catch (error) {
        console.error('Error requiring user:', error)
        // Re-throw the error to be handled upstream, potentially resulting in a 401
        throw error 
    }
}