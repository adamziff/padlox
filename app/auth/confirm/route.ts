import { createClient } from '@/utils/supabase/server'
// Import the service role client specifically for DB operations
import { createServiceSupabaseClient } from '@/lib/auth/supabase' 
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') ?? '/dashboard'

    // Declare err outside the try block to use in the final catch
    let err: (Error & { code?: string; details?: string; hint?: string; }) | null = null;

    if (token_hash && type) {
        // Create a standard client for authentication verification
        const supabase = await createClient()
        try {
            // Verify the OTP token hash
            const { data: { session }, error: verifyError } = await supabase.auth.verifyOtp({
                token_hash,
                // Ensure type is correctly passed if needed, defaulting to 'email' for magic link
                type: type === 'signup' || type === 'invite' ? type : 'email', 
            })

            if (verifyError) throw verifyError; // Throw if verification fails

            // Verification successful, now get the user and upsert
            if (!session || !session.user) {
                throw new Error('Verification successful but no session or user found.');
            }
            const user = session.user;

            // Create a service role client ONLY for database operations
            const serviceRoleClient = createServiceSupabaseClient()

            // Upsert the user in the database
            const { error: dbError } = await serviceRoleClient
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    // Use user's created_at if available, otherwise now
                    created_at: user.created_at || new Date().toISOString(), 
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'id' // Use 'id' as the conflict target
                })

            if (dbError) {
                 console.error('Error upserting user in database (confirm route):', {
                    message: dbError.message,
                    details: dbError.details,
                    hint: dbError.hint,
                    code: dbError.code
                })
                // Throw the DB error to be caught by the outer catch block
                throw dbError; 
            }

            // Redirect to the intended 'next' page on full success
            return NextResponse.redirect(new URL(next, request.url))

        } catch (error: unknown) {
            // Capture error details for logging and redirection
            err = error as Error & { code?: string; details?: string; hint?: string; };
            console.error('Auth confirm route error:', {
                message: err?.message,
                details: err?.details,
                hint: err?.hint,
                code: err?.code,
                stack: err?.stack // Include stack trace for better debugging
            });
        }
    } else {
        // Handle missing token_hash or type
        console.error('Auth confirm route error: Missing token_hash or type');
        err = new Error('Missing token_hash or type') as Error & { code?: string };
        err.code = 'missing_parameters';
    }

    // Generic error handling: Redirect to an error page
    // Include error code if available
    const errorParam = err?.code ? `?error_code=${encodeURIComponent(err.code)}` : (err?.message ? `?error_message=${encodeURIComponent(err.message)}` : '');
    return NextResponse.redirect(new URL(`/auth/auth-error${errorParam}`, request.url));
}