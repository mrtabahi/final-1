-- Admin-controlled typing UI options per test.
-- candidate = user may toggle; on/off = enforced and locked in the candidate UI.
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS highlight_mode text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS backspace_mode text,
  ADD COLUMN IF NOT EXISTS hide_paragraph_mode text NOT NULL DEFAULT 'candidate';

-- Preserve the old Backspace policy for existing tests instead of unexpectedly enabling it.
UPDATE public.tests
SET backspace_mode = CASE WHEN COALESCE(allow_backspace, false) THEN 'on' ELSE 'off' END
WHERE backspace_mode IS NULL;

ALTER TABLE public.tests
  ALTER COLUMN backspace_mode SET DEFAULT 'candidate',
  ALTER COLUMN backspace_mode SET NOT NULL;

ALTER TABLE public.tests
  DROP CONSTRAINT IF EXISTS tests_highlight_mode_check,
  ADD CONSTRAINT tests_highlight_mode_check CHECK (highlight_mode IN ('candidate','on','off')),
  DROP CONSTRAINT IF EXISTS tests_backspace_mode_check,
  ADD CONSTRAINT tests_backspace_mode_check CHECK (backspace_mode IN ('candidate','on','off')),
  DROP CONSTRAINT IF EXISTS tests_hide_paragraph_mode_check,
  ADD CONSTRAINT tests_hide_paragraph_mode_check CHECK (hide_paragraph_mode IN ('candidate','on','off'));
