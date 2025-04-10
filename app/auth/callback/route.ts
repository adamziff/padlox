import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/myhome'

    if (code) {
        // Use the server client from lib/auth
        const supabase = createClient()

        try {
            // Exchange the code for a session
            const { error: authError } = await supabase.auth.exchangeCodeForSession(code)
            if (authError) throw authError

            // Get the authenticated user
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            if (!user) throw new Error('No user found after authentication')

            // Create or update the user in our database
            const { error: dbError } = await supabase
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'id'
                })

            if (dbError) {
                console.error('Error upserting user in database:', {
                    message: dbError.message,
                    details: dbError.details,
                    hint: dbError.hint,
                    code: dbError.code
                })
            }

            return NextResponse.redirect(`${origin}${next}`)
        } catch (error) {
            console.error('Auth callback error:', error)
            return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url))
        }
    }

    console.log('Auth callback: No code found, redirecting to login.')
    return NextResponse.redirect(new URL('/login?error=no_code', request.url))
} 