'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

import { login } from '../actions';

export interface LoginActionState {
    status: 'idle' | 'in_progress' | 'success' | 'failed' | 'invalid_data' | 'invalid_email_domain';
}

export default function Page() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [isSuccessful, setIsSuccessful] = useState(false);

    const [state, formAction] = useActionState<LoginActionState, FormData>(
        login,
        {
            status: 'idle',
        },
    );

    useEffect(() => {
        if (state.status === 'failed') {
            toast.error('Invalid credentials!');
        } else if (state.status === 'invalid_email_domain') {
            toast.error('Please use a @princeton.com email address');
        } else if (state.status === 'invalid_data') {
            toast.error('Please check your email and password format');
        } else if (state.status === 'success') {
            setIsSuccessful(true);
            router.refresh();
        }
    }, [state.status, router]);

    const handleSubmit = (formData: FormData) => {
        setEmail(formData.get('email') as string);
        formAction(formData);
    };

    return (
        <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
            <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
                <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
                    <h3 className="text-xl font-semibold dark:text-zinc-50">PCIChat: Sign In</h3>

                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                        {"Don't have an account? "}
                        <Link
                            href="/register"
                            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
                        >
                            Sign up
                        </Link>
                    </p>
                </div>
                <AuthForm action={handleSubmit} defaultEmail={email}>
                    <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
                </AuthForm>
            </div>
        </div>
    );
}
