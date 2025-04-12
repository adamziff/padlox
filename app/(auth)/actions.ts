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
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/myhome`,
            },
        })

        if (error) {
            console.error('Magic Link error:', error.message)
            throw new Error(`Magic Link Error: ${error.message}`);
        }

        console.log(`Magic link sent successfully to ${email}`);
        return { success: true, email: email };

    } catch (error) {
        console.error('Unexpected error during loginOrRegister:', error)
        if (error instanceof Error) {
           throw error;
        }
        throw new Error('An unexpected error occurred during login/register');
    }
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}