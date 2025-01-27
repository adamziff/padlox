// 'use client';

// import Link from 'next/link';
// import { useRouter } from 'next/navigation';
// import { useActionState, useEffect, useState } from 'react';
// import { toast } from 'sonner';

// import { AuthForm } from '@/components/auth-form';
// import { SubmitButton } from '@/components/submit-button';

// import { signup } from '../actions';

// export type RegisterActionState = {
//     status:
//     | 'idle'
//     | 'user_exists'
//     | 'failed'
//     | 'invalid_data'
//     | 'invalid_email_domain'
//     | 'success'
//     | 'otp_sent'
//     | 'invalid_otp';
// };

// export default function Page() {
//     const router = useRouter();

//     const [email, setEmail] = useState('');
//     const [isSuccessful, setIsSuccessful] = useState(false);
//     const [showOTP, setShowOTP] = useState(false);

//     const [state, formAction] = useActionState<RegisterActionState, FormData>(
//         signup,
//         {
//             status: 'idle',
//         },
//     );

//     useEffect(() => {
//         if (state.status === 'user_exists') {
//             toast.error('Account already exists');
//         } else if (state.status === 'failed') {
//             toast.error('Failed to create account');
//         } else if (state.status === 'invalid_email_domain') {
//             toast.error('Please use a @princeton.com email address');
//         } else if (state.status === 'invalid_data') {
//             toast.error('Please check your email and password format');
//         } else if (state.status === 'otp_sent') {
//             toast.success('Verification code sent to your email');
//             setShowOTP(true);
//         } else if (state.status === 'invalid_otp') {
//             toast.error('Invalid or expired verification code');
//         } else if (state.status === 'success') {
//             toast.success('Account created successfully! Please sign in.');
//             setIsSuccessful(true);
//             router.push('/login');
//         }
//     }, [state, router]);

//     const handleSubmit = (formData: FormData) => {
//         if (!showOTP) {
//             // Initial registration - store email and submit form as is
//             setEmail(formData.get('email') as string);
//             formAction(formData);
//         } else {
//             // OTP verification - create new FormData with stored email
//             const enrichedFormData = new FormData();
//             enrichedFormData.append('email', email);
//             enrichedFormData.append('otp', formData.get('otp') as string);
//             formAction(enrichedFormData);
//         }
//     };

//     return (
//         <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
//             <div className="w-full max-w-md overflow-hidden rounded-2xl gap-12 flex flex-col">
//                 <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
//                     <h3 className="text-xl font-semibold dark:text-zinc-50">Create a PCIChat Account</h3>
//                     <p className="text-sm text-gray-500 dark:text-zinc-400">
//                         {showOTP
//                             ? 'Enter the verification code sent to your email'
//                             : 'Use your @princeton.com email.'}
//                     </p>
//                 </div>
//                 <AuthForm action={handleSubmit} defaultEmail={email} showOTP={showOTP}>
//                     <SubmitButton isSuccessful={isSuccessful}>
//                         {showOTP ? 'Verify' : 'Sign Up'}
//                     </SubmitButton>
//                     <p className="text-center text-sm text-gray-600 mt-4 dark:text-zinc-400">
//                         {'Already have an account? '}
//                         <Link
//                             href="/login"
//                             className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
//                         >
//                             Sign in
//                         </Link>
//                         {' instead.'}
//                     </p>
//                 </AuthForm>
//             </div>
//         </div>
//     );
// }
