-- Server-authoritative typing sessions and one-result-per-session protection.
BEGIN;
CREATE TABLE IF NOT EXISTS public.typing_exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS typing_exam_sessions_user_started_idx
  ON public.typing_exam_sessions(user_id, started_at DESC);
ALTER TABLE public.typing_exam_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.typing_exam_sessions FROM anon, authenticated;
GRANT ALL ON public.typing_exam_sessions TO service_role;

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.typing_exam_sessions(id);
CREATE UNIQUE INDEX IF NOT EXISTS attempts_session_id_unique
  ON public.attempts(session_id) WHERE session_id IS NOT NULL;

-- Direct browser inserts are disabled. The Edge Function uses service_role only
-- after validating the caller, session ownership, test, and server-side score.
DROP POLICY IF EXISTS attempts_self_insert ON public.attempts;
REVOKE INSERT ON public.attempts FROM anon, authenticated;
COMMIT;
