// No 'use client' directive here anymore

// Keep only necessary server-side imports
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers' // Keep this for createClient if it needs it

// Import the client component
import { LoginForm } from './login-form'

// Server Component: Checks auth and renders client form if needed
export default async function LoginPage() {
    const supabase = await createClient() // Await the async function

    const {
        data: { session },
    } = await supabase.auth.getSession()

    // If user is already logged in, redirect to dashboard
    if (session) {
        redirect('/dashboard')
    }

    // If not logged in, render the client component form
    return <LoginForm />
}