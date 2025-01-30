import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        try {
            const supabase = await createClient()
            const { error } = await supabase.auth.exchangeCodeForSession(code)

            if (!error) {
                return NextResponse.redirect(new URL(next, request.url))
            }
        } catch (error) {
            console.error('Auth callback error:', error)
        }
    }

    // Return the user to an error page with some instructions
    return NextResponse.redirect(new URL('/auth/auth-error', request.url))
} 