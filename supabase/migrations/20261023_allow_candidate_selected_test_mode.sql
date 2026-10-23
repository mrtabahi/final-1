-- The admin UI supports a candidate-selectable typing layout.
-- The typing-result function resolves the actual attempt mode from the candidate's choice.
ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS tests_mode_check;
ALTER TABLE public.tests ADD CONSTRAINT tests_mode_check CHECK (mode IN ('screen','page','candidate'));
