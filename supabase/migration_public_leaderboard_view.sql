-- Public leaderboard projection with least-privilege columns.
-- Safe to re-run: view replacement and grants are idempotent.
CREATE OR REPLACE VIEW public.public_leaderboard_attempts WITH (security_barrier = true) AS
SELECT a.id, a.candidate_name, a.language, a.duration_seconds, a.created_at,
       a.gross_wpm, a.net_wpm, a.accuracy, COALESCE(t.title, '-') AS test_name
FROM public.attempts AS a
LEFT JOIN public.tests AS t ON t.id = a.test_id
WHERE COALESCE(t.leaderboard_enabled, true) = true;
GRANT SELECT ON public.public_leaderboard_attempts TO anon, authenticated;
