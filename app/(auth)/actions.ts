'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

/**
 * Unified loginOrRegister action:
 * - ShouldCreateUser: true => If user doesn't exist, create them; otherwise send Magic Link
 * - Logs a message when sending the email, for debugging purposes
 */
export async function loginOrRegister(formData: FormData) {
    const supabase = await createClient()
    const email = formData.get('email') as string

    console.log(`[loginOrRegister] About to send login/signup email to: ${email}`)

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
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
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}