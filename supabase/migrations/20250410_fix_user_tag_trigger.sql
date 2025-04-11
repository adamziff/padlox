-- Drop the trigger and function completely to isolate the issue
DROP TRIGGER IF EXISTS create_default_user_tags_after_user_creation ON auth.users;
DROP FUNCTION IF EXISTS public.create_default_user_tags_with_user();

-- Any previous GRANT statements related to this function/trigger are now irrelevant. 