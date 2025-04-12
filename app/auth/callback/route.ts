import { createClient } from '@/utils/supabase/server'
// Import the service role client specifically for DB operations
import { createServiceSupabaseClient } from '@/lib/auth/supabase' 
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        // Create a supabase client for authentication (handles cookies for user context)
        const supabase = await createClient()

        try {
            // Exchange the code for a session
            const { error: authError } = await supabase.auth.exchangeCodeForSession(code)
            if (authError) throw authError

            // Get the authenticated user using the *same* client instance
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            if (!user) throw new Error('No user found after authentication')

            // Create a service role client ONLY for database operations requiring elevated privileges
            const serviceRoleClient = createServiceSupabaseClient() // Use the specific function

            // Create or update the user in our database
            const { error: dbError } = await serviceRoleClient
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'id'
                })

            if (dbError) {
                console.error('Error creating user in database:', {
                    message: dbError.message,
                    details: dbError.details,
                    hint: dbError.hint,
                    code: dbError.code
                })
                throw dbError
            }

            return NextResponse.redirect(new URL(next, request.url))
        } catch (error: unknown) {
            const err = error as Error & {
                details?: string
                hint?: string
                code?: string
            }
            console.error('Auth callback error:', {
                message: err?.message,
                details: err?.details,
                hint: err?.hint,
                code: err?.code,
                stack: err?.stack
            })
            // Redirect with error code for better debugging/user feedback
            const errorParam = err?.code ? `?error_code=${encodeURIComponent(err.code)}` : ''
            return NextResponse.redirect(new URL(`/auth/auth-error${errorParam}`, request.url))
        }
    }

    // Return the user to an error page if no code is present
    return NextResponse.redirect(new URL('/auth/auth-error?error_code=missing_code', request.url))
} 