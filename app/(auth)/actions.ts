'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

/**
 * Unified loginOrRegister action:
 * - ShouldCreateUser: true => If user doesn't exist, create them; otherwise send Magic Link
 * - Uses the new serverSupabaseClient for better cookie handling
 */
export async function loginOrRegister(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/dashboard`,
            },
        })

        if (error) {
            console.error('Magic Link error:', error.message)
            return { error: error.message }
        }

        // On success, return success and email for client-side redirect
        return { success: true, email }
    } catch (error) {
        console.error('Unexpected error during loginOrRegister:', error)
        // Don't catch the redirect error here anymore
        return { error: 'An unexpected error occurred' }
    }
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}