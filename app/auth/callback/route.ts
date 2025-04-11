import { createClient, createServiceClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/myhome'

    if (code) {
        // Use the regular server client for auth operations
        const supabase = await createClient()

        try {
            // Exchange the code for a session
            const { error: authError } = await supabase.auth.exchangeCodeForSession(code)
            if (authError) throw authError

            // Get the authenticated user
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            if (!user || !user.email) throw new Error('No user or user email found after authentication')

            // Use a service role client to call the DB function
            const supabaseService = createServiceClient() // Create service client
            const { error: functionError } = await supabaseService.rpc('ensure_user_profile_and_tags', {
                p_user_id: user.id,
                p_user_email: user.email
            })

            if (functionError) {
                console.error('Error calling ensure_user_profile_and_tags:', {
                    message: functionError.message,
                    details: functionError.details,
                    hint: functionError.hint,
                    code: functionError.code
                })
                // Decide if this error should prevent login or just be logged
                // For now, let's log it but continue the redirect
            }

            return NextResponse.redirect(`${origin}${next}`)
        } catch (error) {
            console.error('Auth callback error:', error)
            // Redirect to an error page or login with an error message
            const redirectUrl = new URL('/login', request.url)
            redirectUrl.searchParams.set('error', 'auth_callback_failed')
            redirectUrl.searchParams.set('message', error instanceof Error ? error.message : 'An unexpected error occurred during callback.')
            return NextResponse.redirect(redirectUrl)
        }
    }

    console.log('Auth callback: No code found, redirecting to login.')
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('error', 'no_code')
    return NextResponse.redirect(redirectUrl)
} 