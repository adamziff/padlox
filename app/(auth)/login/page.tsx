'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginOrRegister } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginPage() {
    const [emailSent, setEmailSent] = useState(false)
    const [sentTo, setSentTo] = useState<string>('')
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        const formData = new FormData(e.currentTarget)

        try {
            const result = await loginOrRegister(formData)

            if (result?.success && result.email) {
                router.push(`/verify?email=${encodeURIComponent(result.email)}`)
            } else if (result?.error) {
                setError(result.error)
            } else {
                setError('An unexpected error occurred. Please try again.')
            }
        } catch (err: unknown) {
            console.error('Client-side form submission error:', err)
            setError('An unexpected client-side error occurred. Please try again.')
        }
    }

    if (emailSent) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-6">
                <Link href="/" className="absolute top-4 left-4 flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <Image src="/lock.svg" alt="Padlox logo" width={24} height={24} className="dark:invert" />
                    <span className="font-semibold">Padlox</span>
                </Link>
                <div className="absolute top-4 right-4">
                    <ThemeToggle />
                </div>
                <Card className="w-full max-w-md">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold text-center">Check your email</CardTitle>
                        <CardDescription className="text-center text-muted-foreground">
                            We sent a magic link to{' '}
                            <span className="font-medium text-foreground">{sentTo}</span>
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
                            No email? Check your spam folder or{' '}
                            <button
                                type="button"
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
            <Link href="/" className="absolute top-4 left-4 flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Image src="/lock.svg" alt="Padlox logo" width={24} height={24} className="dark:invert" />
                <span className="font-semibold">Padlox</span>
            </Link>
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">Welcome to Padlox</CardTitle>
                    <CardDescription className="text-center text-muted-foreground">
                        Enter your email to sign in or create an account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <p className="text-sm font-medium text-destructive">{error}</p>
                        )}
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
                        <Button type="submit" className="w-full font-medium" size="lg">
                            Continue with Email
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}