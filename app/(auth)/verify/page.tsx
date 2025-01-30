'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function VerifyPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const email = searchParams.get('email')
    const type = searchParams.get('type')
    const [otp, setOtp] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const isSignup = type === 'signup'

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const supabase = createClient()

            const { error } = await supabase.auth.verifyOtp({
                email: email!,
                token: otp,
                type: isSignup ? 'signup' : 'email',
            })

            if (error) {
                setError(error.message)
                return
            }

            // If successful, redirect to dashboard
            router.push('/dashboard')
        } catch (err) {
            setError('An error occurred while verifying your code')
        } finally {
            setIsLoading(false)
        }
    }

    async function resendCode() {
        setError(null)
        setIsLoading(true)

        try {
            const supabase = createClient()

            const { error } = await supabase.auth.signInWithOtp({
                email: email!,
                options: {
                    shouldCreateUser: false,
                }
            })

            if (error) {
                setError(error.message)
            }
        } catch (err) {
            setError('Failed to resend verification code')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background">
            <Card className="w-full max-w-md mx-4">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">
                        {isSignup ? 'Verify your email' : 'Enter verification code'}
                    </CardTitle>
                    <CardDescription className="text-center text-muted-foreground">
                        {isSignup
                            ? `We sent a verification link to ${email}. Please check your email to continue.`
                            : `We sent a code to ${email}. Please enter it below to verify your login.`
                        }
                    </CardDescription>
                </CardHeader>
                {!isSignup && (
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="otp" className="text-sm font-medium leading-none">
                                    Verification Code
                                </label>
                                <Input
                                    id="otp"
                                    placeholder="Enter 6-digit code"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    maxLength={6}
                                    className="text-center text-2xl tracking-widest"
                                    disabled={isLoading}
                                />
                            </div>
                            {error && (
                                <p className="text-sm text-destructive text-center">
                                    {error}
                                </p>
                            )}
                            <Button
                                type="submit"
                                className="w-full"
                                size="lg"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Verifying...' : 'Verify'}
                            </Button>
                        </form>
                    </CardContent>
                )}
                <CardFooter className="flex flex-col space-y-4">
                    {!isSignup && (
                        <button
                            onClick={resendCode}
                            className="text-sm text-primary hover:text-primary/80 disabled:opacity-50"
                            disabled={isLoading}
                        >
                            Didn&apos;t receive a code? Send again
                        </button>
                    )}
                    <button
                        onClick={() => router.push('/login')}
                        className="text-sm text-muted-foreground hover:text-muted-foreground/80"
                    >
                        Back to login
                    </button>
                </CardFooter>
            </Card>
        </div>
    )
} 