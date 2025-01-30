'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import Link from 'next/link'

export default function AuthErrorPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-6">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">Authentication error</CardTitle>
                    <CardDescription className="text-center text-muted-foreground">
                        There was a problem verifying your email. This might be because:
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ul className="list-disc pl-4 space-y-2 text-sm text-muted-foreground">
                        <li>The verification link has expired</li>
                        <li>The link has already been used</li>
                        <li>The link is invalid or malformed</li>
                    </ul>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4">
                    <Button
                        asChild
                        className="w-full"
                    >
                        <Link href="/login">
                            Back to login
                        </Link>
                    </Button>
                    <p className="text-sm text-center text-muted-foreground">
                        Need help?{' '}
                        <Link href="/support" className="font-medium text-primary hover:text-primary/80">
                            Contact support
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    )
} 