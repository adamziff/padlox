-- Function to ensure a user exists in public.users and has default tags
CREATE OR REPLACE FUNCTION public.ensure_user_profile_and_tags(
    p_user_id UUID,
    p_user_email TEXT
)
RETURNS VOID AS $$
BEGIN
    -- 1. Ensure the user exists in public.users
    -- Use COALESCE for email safety, although it should always be present here.
    INSERT INTO public.users (id, email)
    VALUES (p_user_id, COALESCE(p_user_email, 'error_missing_email@ensure_profile'))
    ON CONFLICT (id) DO NOTHING; -- Do nothing if user already exists

    -- 2. Ensure the user has default tags in user_tags
    INSERT INTO public.user_tags (user_id, tag_id, is_default)
    SELECT p_user_id, t.id, true
    FROM public.tags t
    WHERE t.name IN (
        'Electronics', 'Furniture', 'Clothing', 'Jewelry', 'Art',
        'Kitchen', 'Appliances', 'Sports Equipment', 'Tools'
    )
    ON CONFLICT (user_id, tag_id) DO NOTHING; -- Do nothing if tag association already exists

END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- Use SECURITY DEFINER to ensure permissions

-- Grant privileges for the function owner (typically 'postgres') to interact with tables
-- Adjust role if your setup is different.
GRANT INSERT, SELECT ON TABLE public.users TO postgres;
GRANT INSERT, SELECT ON TABLE public.user_tags TO postgres;
GRANT SELECT ON TABLE public.tags TO postgres;
GRANT USAGE ON SCHEMA public TO postgres;

-- Ensure the function owner is postgres
ALTER FUNCTION public.ensure_user_profile_and_tags(UUID, TEXT) OWNER TO postgres;

-- Grant EXECUTE permission to the 'service_role'
-- This function should ideally be called from secure server-side contexts (like edge functions or server actions)
-- using the service role client for safety.
GRANT EXECUTE ON FUNCTION public.ensure_user_profile_and_tags(UUID, TEXT) TO service_role;

-- Optional: If you intend to call this *directly* from client-side authenticated contexts
-- (less secure, generally not recommended for this type of operation), you might grant to 'authenticated'.
-- GRANT EXECUTE ON FUNCTION public.ensure_user_profile_and_tags(UUID, TEXT) TO authenticated; 