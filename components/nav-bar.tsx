'use client'

import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { logout } from "@/app/(auth)/actions"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"

export function NavBar() {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
    const [isScrolled, setIsScrolled] = useState(false);
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

        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            subscription.unsubscribe()
            window.removeEventListener('scroll', handleScroll);
        }
    }, [supabase])

    return (
        <header className={cn(
            "sticky top-0 z-50 w-full transition-all duration-300",
            isScrolled ? "border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" : "bg-transparent"
        )}>
            <div className="container flex h-16 items-center mx-auto px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2 mr-6 hover:opacity-80 transition-opacity">
                    <Image src="/lock.svg" alt="Padlox logo" width={28} height={28} className="dark:invert" />
                    <span className="font-semibold text-lg">Padlox</span>
                </Link>
                <nav className="hidden md:flex items-center space-x-4 lg:space-x-6 flex-1">
                    {/* Placeholder for future B2B navigation links if needed */}
                    <Link href="/how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">How It Works</Link>
                    {/* <Link href="/features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Features</Link> */}
                    {/* <Link href="/pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Pricing</Link> */}
                    {/* <Link href="/integrations" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Integrations</Link> */}
                </nav>
                <div className="ml-auto flex items-center space-x-3">
                    <ThemeToggle />
                    {isLoggedIn ? (
                        <>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/dashboard">Dashboard</Link>
                            </Button>
                            <form action={logout}>
                                <Button variant="ghost" size="sm">Log out</Button>
                            </form>
                        </>
                    ) : (
                        <Button
                            size="sm"
                            asChild
                        >
                            <a href="mailto:adam@padlox.io">Request Demo</a>
                        </Button>
                    )}
                </div>
            </div>
        </header>
    )
} 