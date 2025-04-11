'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/auth/supabase'

/**
 * Unified loginOrRegister action:
 * - ShouldCreateUser: true => If user doesn't exist, create them; otherwise send Magic Link
 * - Uses the new serverSupabaseClient for better cookie handling
 */
export async function loginOrRegister(formData: FormData) {
    const supabase = await createServerSupabaseClient()
    const email = formData.get('email') as string

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/myhome`,
            },
        })

        if (error) {
            console.error('Magic Link error:', error.message)
            return { error: error.message }
        }

        // On success, we redirect to /verify (just one place to handle user input of code, if needed)
        redirect(`/verify?email=${encodeURIComponent(email)}`)
    } catch (error) {
        console.error('Unexpected error during loginOrRegister:', error)
        return { error: 'An unexpected error occurred' }
    }
}

export async function logout() {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}