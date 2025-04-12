'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function VerifyContent() {
    const searchParams = useSearchParams()
    const email = searchParams.get('email')

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background">
            <Card className="w-full max-w-md mx-4">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">
                        Check your email
                    </CardTitle>
                    <CardDescription className="text-center text-muted-foreground">
                        {email ?
                            <>We sent a magic link to <strong>{email}</strong>. Click the link to sign in.</> :
                            'Please check your email for a magic link to sign in.'
                        }
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    )
}

export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        }>
            <VerifyContent />
        </Suspense>
    )
} 