BEGIN;

-- Both trigger functions use schema-qualified relations and pg_catalog built-ins.
-- An empty search_path prevents object-shadowing through writable schemas.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.touch_updated_at() SET search_path = '';

COMMIT;
