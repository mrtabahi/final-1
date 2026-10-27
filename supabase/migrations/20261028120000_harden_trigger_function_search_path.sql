-- Harden trigger functions against search_path object-shadowing.
-- Referenced application tables are schema-qualified in handle_new_user;
-- touch_updated_at only uses built-in now() and the trigger record.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = pg_catalog, pg_temp;
