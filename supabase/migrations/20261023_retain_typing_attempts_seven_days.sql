-- Keep candidate typing history for seven days only.
CREATE OR REPLACE FUNCTION public.delete_expired_typing_attempts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM public.attempts WHERE created_at < now() - interval '7 days'; $$;
REVOKE ALL ON FUNCTION public.delete_expired_typing_attempts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_expired_typing_attempts() FROM anon, authenticated;
SELECT public.delete_expired_typing_attempts();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron could not be enabled; run the cleanup function periodically to delete expired rows.';
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-expired-typing-attempts-daily') THEN
      PERFORM cron.schedule('delete-expired-typing-attempts-daily','17 3 * * *','SELECT public.delete_expired_typing_attempts();');
    END IF;
  END IF;
END $$;