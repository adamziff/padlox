'use client'

import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { logout } from "@/app/(auth)/actions"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { MenuIcon, XIcon } from 'lucide-react'

export function NavBar() {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    const handleMobileLinkClick = () => {
        setIsMobileMenuOpen(false);
    };

    return (
        <header className={cn(
            "sticky top-0 z-50 w-full transition-all duration-300",
            isScrolled || isMobileMenuOpen ? "border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" : "bg-transparent"
        )}>
            <div className="container flex h-16 items-center mx-auto px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2 mr-auto md:mr-6 hover:opacity-80 transition-opacity">
                    <Image src="/lock.svg" alt="Padlox logo" width={28} height={28} className="dark:invert" />
                    <span className="font-semibold text-lg">Padlox</span>
                </Link>

                <nav className="hidden md:flex items-center space-x-4 lg:space-x-6 md:mr-auto">
                    <Link href="/how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">How It Works</Link>
                </nav>

                <div className="hidden md:flex items-center space-x-3">
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
                        <Button size="sm" asChild>
                            <Link href="/login">Get Started</Link>
                        </Button>
                    )}
                </div>

                <div className="ml-3 md:hidden flex items-center">
                    <ThemeToggle />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleMobileMenu}
                        aria-label="Toggle mobile menu"
                        className="ml-2"
                    >
                        {isMobileMenuOpen ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
                    </Button>
                </div>
            </div>

            {isMobileMenuOpen && (
                <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <nav className="flex flex-col space-y-2 px-4 py-4">
                        <Link href="/how-it-works"
                            className="text-base font-medium text-foreground hover:text-primary transition-colors"
                            onClick={handleMobileLinkClick}
                        >
                            How It Works
                        </Link>
                        {isLoggedIn ? (
                            <>
                                <Link href="/dashboard"
                                    className="text-base font-medium text-foreground hover:text-primary transition-colors"
                                    onClick={handleMobileLinkClick}
                                >
                                    Dashboard
                                </Link>
                                <form action={logout}>
                                    <Button variant="ghost" size="sm" className="w-full justify-start px-0 text-base font-medium text-foreground hover:text-primary">Log out</Button>
                                </form>
                            </>
                        ) : (
                            <Button size="sm" asChild onClick={handleMobileLinkClick}>
                                <Link href="/login">Get Started</Link>
                            </Button>
                        )}
                    </nav>
                </div>
            )}
        </header>
    )
} 