// No 'use client' directive here anymore

// Keep only necessary server-side imports
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

// Import the client component
import { LoginForm } from './login-form'
import { NavBar } from '@/components/nav-bar'

// Server Component: Checks auth and renders client form if needed
export default async function LoginPage() {
    const supabase = await createClient() // Await the async function

    const {
        data: { session },
        error
    } = await supabase.auth.getSession()

    console.log('[LOGIN] Session check:', { hasSession: !!session, hasUser: !!session?.user, error: error?.message })

    // If user is already logged in, redirect to dashboard
    if (session) {
        console.log('[LOGIN] Session found, redirecting to dashboard')
        redirect('/dashboard')
    }

    // Render NavBar and the client component form
    return (
        <>
            <NavBar />
            <LoginForm />
        </>
    )
}