'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: false, // Don't create new users through login
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
            }
        })

        if (error) {
            console.error('Login error:', error.message)
            return { error: error.message }
        }

        // Redirect to verification page
        redirect(`/verify?email=${encodeURIComponent(email)}`)
    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

export async function signup(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true, // Create a new user if they don't exist
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
                data: {
                    created_at: new Date().toISOString(),
                }
            }
        })

        if (error) {
            console.error('Signup error:', error.message)
            return { error: error.message }
        }

        // Redirect to verification page
        redirect(`/verify?email=${encodeURIComponent(email)}&type=signup`)
    } catch (error) {
        console.error('Unexpected error:', error)
        return { error: 'An unexpected error occurred' }
    }
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/login')
}