import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        // Create a supabase client for authentication
        const supabase = await createClient()

        try {
            // Exchange the code for a session
            const { error: authError } = await supabase.auth.exchangeCodeForSession(code)
            if (authError) throw authError

            // Get the authenticated user
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError) throw userError
            if (!user) throw new Error('No user found after authentication')

            // Create a service role client for database operations
            const serviceRoleClient = await createClient()

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
        } catch (error: any) {
            console.error('Auth callback error:', {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code,
                stack: error?.stack
            })
            return NextResponse.redirect(new URL('/auth/auth-error', request.url))
        }
    }

    // Return the user to an error page with some instructions
    return NextResponse.redirect(new URL('/auth/auth-error', request.url))
} 