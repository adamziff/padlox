'use client'

import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { logout } from "@/app/(auth)/actions"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"

export function NavBar() {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
    const supabase = createClient()

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setIsLoggedIn(!!session)
        }

        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsLoggedIn(!!session)
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [supabase])

    return (
        <div className="border-b">
            <div className="flex h-16 items-center px-4 container mx-auto">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <Image src="/lock.svg" alt="Padlox logo" width={24} height={24} className="dark:invert" />
                    <div className="font-semibold">Padlox</div>
                </Link>
                <nav className="flex items-center space-x-4 lg:space-x-6 mx-6">
                    {isLoggedIn && (
                        <Link
                            href="/dashboard"
                            className="text-sm font-medium transition-colors hover:text-primary"
                        >
                            Dashboard
                        </Link>
                    )}
                </nav>
                <div className="ml-auto flex items-center space-x-4">
                    <ThemeToggle />
                    {isLoggedIn ? (
                        <form action={logout}>
                            <Button
                                variant="outline"
                                size="sm"
                            >
                                Log out
                            </Button>
                        </form>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                        >
                            <Link href="/login">
                                Log in
                            </Link>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
} 