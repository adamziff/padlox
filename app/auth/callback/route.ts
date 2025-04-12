import { createClient, createServiceClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    console.log("Auth callback route handler started.");
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/myhome'

    if (code) {
        const supabase = await createClient()
        try {
            // 1. Exchange code for session
            const { error: authError } = await supabase.auth.exchangeCodeForSession(code)
            if (authError) throw new Error(`Auth code exchange failed: ${authError.message}`)

            // 2. Get the authenticated user
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError) throw new Error(`Getting user failed: ${userError.message}`)
            if (!user || !user.id || !user.email) throw new Error('No valid user found after authentication')

            console.log(`Auth callback: User authenticated (${user.id}). Ensuring profile and default tags...`);

            // 3. Use service client for database operations
            console.log(`Auth callback: Using Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
            console.log(`Auth callback: Service key starts with: ${process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 5)}`);
            const supabaseService = createServiceClient()

            // 4. Ensure user exists in public.users
            const { error: upsertUserError } = await supabaseService
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    updated_at: new Date().toISOString() // Keep updated_at fresh
                }, { onConflict: 'id' })

            if (upsertUserError) {
                console.error('Auth callback: Error upserting user profile:', upsertUserError)
                // Consider if this should block login. For now, log and continue.
            } else {
                console.log(`Auth callback: Upserted user profile for ${user.id}`);
            }

            // 5. Get default tag IDs
            const defaultTagNames = [
                'Electronics', 'Furniture', 'Clothing', 'Jewelry', 'Art',
                'Kitchen', 'Appliances', 'Sports Equipment', 'Tools'
            ];
            const { data: defaultTags, error: tagsError } = await supabaseService
                .from('tags')
                .select('id')
                .in('name', defaultTagNames)

            if (tagsError) {
                console.error('Auth callback: Error fetching default tags:', tagsError)
            } else if (defaultTags && defaultTags.length > 0) {
                console.log(`Auth callback: Found ${defaultTags.length} default tags.`);
                // 6. Prepare and insert default user tags associations
                const userTagsToInsert = defaultTags.map(tag => ({
                    user_id: user.id,
                    tag_id: tag.id,
                    is_default: true
                }));

                const { error: insertTagsError } = await supabaseService
                    .from('user_tags')
                    .insert(userTagsToInsert, {
                         // For Supabase client v2+, use `upsert` with ignore option or handle conflict
                         // For older versions, ON CONFLICT might be needed in raw SQL or a function
                         // Let's assume `insert` with conflict handling is desired / possible via library
                         // Or simply let potential primary key violations fail silently if acceptable
                         // A common pattern is upsert with ignore:
                         // onConflict: 'user_id,tag_id' // Specify conflict target
                         // ignoreDuplicates: true // (or similar option if available)
                         // If ignoreDuplicates isn't directly supported, simple insert might error
                         // if called multiple times, ON CONFLICT in SQL is more robust.
                         // Let's try a simple insert first and see if client handles PK violations gracefully.
                     })

                if (insertTagsError) {
                    // Ignore primary key violations (23505) as they mean the tag association already exists
                    if (insertTagsError.code !== '23505') {
                        console.error('Auth callback: Error inserting default user tags:', insertTagsError)
                    }
                } else {
                    console.log(`Auth callback: Ensured default user tags for ${user.id}`);
                }
            } else {
                 console.log('Auth callback: No default tags found in tags table.');
            }

            // 7. Redirect user
            console.log(`Auth callback: Redirecting user ${user.id} to ${origin}${next}`);
            return NextResponse.redirect(`${origin}${next}`)

        } catch (error) {
            console.error('Auth callback: Unhandled error:', error)
            const redirectUrl = new URL('/login', request.url)
            redirectUrl.searchParams.set('error', 'auth_callback_failed')
            redirectUrl.searchParams.set('message', error instanceof Error ? error.message : 'An unexpected error occurred during callback.')
            return NextResponse.redirect(redirectUrl)
        }
    }

    // Handle case where no code is present
    console.log('Auth callback: No code found, redirecting to login.')
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('error', 'no_code')
    return NextResponse.redirect(redirectUrl)
} 