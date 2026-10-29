# Typing Master Engine

**Canonical scoring file:** `supabase/functions/typing-result/typing-master.js`

## Rule for future changes

Change the scoring/error-counting formulas in `supabase/functions/typing-result/typing-master.js` only. Do not create per-test copies of Gross Speed, Net Speed, Accuracy, error allowance, penalty, Total Correct Word, alignment, or error-breakdown formulas.

The master is loaded by:
- Typing Test: `start_test.html` → `js/typing-engine.js` and `js/app.js`
- Self Test: `self-test.html` → `js/self-test.js`
- Fix Accuracy game: `fix-accuracy.html` → `js/fix-accuracy.js`
- Supabase authoritative result validation: `supabase/functions/typing-result/index.ts` imports this same file.

The old `js/scoring.js` and `js/typing-master.js` are compatibility shims; neither contains a second formula implementation.

## Public API

- `TypingMaster.calculateScore(passage, typedText, seconds, config, keystrokes, formula, backspacePresses)`: existing Typing Test scoring logic, kept unchanged when this master was introduced.
- `TypingMaster.calculateBoth(...)`: computes BSF and CRPF results through the same canonical scorer.
- `TypingMaster.normalizeFormula(formula)`: standardizes the formula choice.
- `TypingMaster.requireCandidateGuard()`: delegates to the site's existing `AuthManager.requireCandidateGuard()` so tests do not implement their own login rules.
- `TypingMaster.calculateCommittedScore(..., finalizeCurrentWord)`: uses the same scorer but lets Fix Accuracy defer the current word's error check until Space is pressed. It does not replace or change `calculateScore`.

## Validation

Scoring regression tests live in `tests/scoring-regression.test.cjs`. Add tests there whenever a master formula changes. The server imports this same file so persisted results use the same calculation as the browser.
