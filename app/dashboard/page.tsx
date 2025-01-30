import { redirect } from 'next/navigation'
import { NavBar } from "@/components/nav-bar"

import { createClient } from '@/utils/supabase/server'

export default async function PrivatePage() {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-background">
            <NavBar />
            <main className="container mx-auto py-6 px-4">
                <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
                <p>Hello {data.user.email}</p>
            </main>
        </div>
    )
}