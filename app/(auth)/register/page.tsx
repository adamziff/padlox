'use client'

import { signup } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import Link from 'next/link'
import { useState } from 'react'

export default function RegisterPage() {
    const [emailSent, setEmailSent] = useState(false)
    const [sentTo, setSentTo] = useState<string>('')

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        const email = formData.get('email') as string

        try {
            await signup(formData)
            // If we get here, the email was sent successfully
            setEmailSent(true)
            setSentTo(email)
        } catch (err) {
            // If it's a redirect error, that means the email was sent successfully
            if ((err as any)?.digest?.includes('NEXT_REDIRECT')) {
                setEmailSent(true)
                setSentTo(email)
            }
            // Ignore other errors as they're likely redirect-related
        }
    }

    if (emailSent) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-6">
                <div className="absolute top-4 right-4">
                    <ThemeToggle />
                </div>
                <Card className="w-full max-w-md">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold text-center">Check your email</CardTitle>
                        <CardDescription className="text-center text-muted-foreground">
                            We sent a verification link to <span className="font-medium text-foreground">{sentTo}</span>. Click the link in the email to verify your account.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center space-y-4">
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                setEmailSent(false)
                                setSentTo('')
                            }}
                        >
                            Use a different email
                        </Button>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            Didn&apos;t receive an email? Check your spam folder or{' '}
                            <button
                                onClick={() => {
                                    setEmailSent(false)
                                    setSentTo('')
                                }}
                                className="text-primary hover:text-primary/80 font-medium"
                            >
                                try again
                            </button>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-6">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
                    <CardDescription className="text-center text-muted-foreground">
                        Enter your email to get started
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium leading-none">
                                Email
                            </label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="name@example.com"
                                required
                                className="w-full"
                                autoComplete="email"
                                autoFocus
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full font-medium"
                            size="lg"
                        >
                            Send verification link
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4">
                    <div className="text-sm text-center text-muted-foreground">
                        Already have an account?{' '}
                        <Link href="/login" className="font-medium text-primary hover:text-primary/80">
                            Sign in
                        </Link>
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}