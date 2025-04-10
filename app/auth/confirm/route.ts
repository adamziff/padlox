import { createServerSupabaseClient } from '@/lib/auth/supabase'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') ?? '/myhome'

    if (token_hash && type) {
        try {
            const supabase = await createServerSupabaseClient()
            const { error } = await supabase.auth.verifyOtp({
                token_hash,
                type: 'email',
            })

            if (!error) {
                return NextResponse.redirect(new URL(next, request.url))
            }
            console.error('Auth confirm OTP error:', error)
        } catch (error) {
            console.error('Auth confirm unexpected error:', error)
        }
    }

    console.log('Auth confirm: Verification failed or params missing, redirecting to login.')
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', request.url))
}