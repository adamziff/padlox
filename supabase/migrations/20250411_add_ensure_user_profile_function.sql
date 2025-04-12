-- Drop the unused database function ensure_user_profile_and_tags
DROP FUNCTION IF EXISTS public.ensure_user_profile_and_tags(UUID, TEXT);

-- Note: Any grants associated specifically with this function are implicitly dropped. 