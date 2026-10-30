-- API roles must never be able to TRUNCATE application tables.
-- TRUNCATE bypasses row-level security, so row policies cannot mitigate this grant.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT format('%I.%I', n.nspname, c.relname) AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE ON TABLE %s FROM anon, authenticated',
      target.relation_name
    );
  END LOOP;
END
$$;
