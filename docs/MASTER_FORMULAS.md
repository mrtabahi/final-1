# Master Formula Specification

**Status:** implementation-derived specification; pending product-owner approval of the allowance rule.

**Canonical implementation:** `supabase/functions/typing-result/typing-master.js`  
**Regression tests:** `tests/scoring-regression.test.cjs`

This document describes the current implementation, not an assumption about what the exam authority requires. Do not change scoring behavior based on this document alone.

## Shared inputs and normalization

- Passage and typed input are converted to strings; nullish values become empty strings.
- Words are tokenized with Unicode-aware whitespace splitting (`/\S+/gu`).
- Duration is clamped to at least 1 second.
- Formula selection is `crpf` only when the supplied formula lowercases to `crpf`; otherwise it defaults to `bsf`.
- The effective elapsed time is `elapsedSeconds`; `elapsedMinutes = elapsedSeconds / 60`.
- Backspace presses are returned as a non-negative integer, but are not directly subtracted from the speed calculation.

## Keystrokes and speed

The scorer counts passage-bounded word characters plus bounded whitespace separators:

1. For each typed word whose index is within the expected passage, count `min(typedWord.length, expectedWord.length)`.
2. Count typed whitespace separators, bounded by the number of whitespace separators in the passage.
3. Add those values to get `measuredKeystrokes`.

Extra words and characters beyond the expected word length cannot inflate the measured keystrokes.

Formulas used by the implementation:

- **Equivalent typed words** = `measuredKeystrokes / 5`.
- **Gross WPM** = `measuredKeystrokes × 60 / (5 × elapsedSeconds)`, rounded to 2 decimal places.
- **Penalty WPM** = `excessErrors × 600 / elapsedSeconds`, rounded to 2 decimal places.
- **Net WPM** = `grossWpm − penaltyWpm`, rounded to 2 decimal places.
- **Net words** = `netWpm / 12` (returned without an additional rounding step).

## Error allowance and penalty

The current implementation calculates:

- `freeErrors = floor(measuredKeystrokes / 100)`.
- `excessErrors = max(0, totalErrors − freeErrors)`.
- `penaltyWords = excessErrors × penaltyPerError`, where `penaltyPerError` is clamped to 0–100 and defaults to 10.
- `totalCorrectWord = measuredKeystrokes / 5 − totalErrors`, rounded to 2 decimal places.

**Important unresolved discrepancy:** the scorer reads and clamps `config.freeErrorPct` / `config.free_error_pct` (default 0.05), but the resulting value is not used in the `freeErrors` calculation. The active rule is one free error per 100 measured keystrokes, not an explicitly computed 5% allowance. Confirm the intended BSF/CRPF exam rule before changing this formula or the associated configuration.

## BSF and CRPF alignment

### BSF

- Uses word-sequence edit-distance alignment.
- Preserves an already-correct prefix, and uses forward traceback to handle repeated words consistently.
- Prefers a substitution when it ties with a delete/insert path.
- Does not count trailing, untyped passage words as errors.
- Counts internal omissions, substitutions, insertions/extra words and repeated spaces according to the current alignment/error rules.
- Counts each repeated run of two or more ordinary spaces as one spacing error.

### CRPF

- Uses positional scoring rather than sequence alignment.
- Splits the trimmed typed input on literal ordinary spaces, so repeated spaces can create empty positions.
- Compares expected and typed words at each position; mismatches and extra positions count as word errors.
- The CRPF branch does not add the BSF double-space error count as a separate error.

A perfect, same-position transcript is expected to produce matching key metrics under both formulas; regression tests cover this invariant.

## Accuracy

The returned `accuracy` is error-based:

```text
accuracy = max(0, 100 − totalErrors × 500 / measuredKeystrokes)
```

It is rounded to 2 decimal places when measured keystrokes are positive; otherwise it is 0. This is distinct from the `correctChars` / `incorrectChars` alignment diagnostics, which compare aligned word text and separators. Do not label those character diagnostics as the accuracy formula.

## Error breakdown and pass status

The result includes counts for omissions, substitutions, spelling errors, incomplete words, extra words, repeated words, spacing errors, capitalization errors, punctuation errors and not-reached trailing words.

- `repeatedWords` is a subset of `extraWords`, not an additional independent error.
- A deleted expected word after the last reached alignment item is categorized as `notReached`; an internal deletion is categorized as an omission.
- `passedByWpm` is true when no target WPM is configured or net WPM meets it.
- `passedByAccuracy` is true when no minimum accuracy is configured or accuracy meets it.
- `passed` requires both conditions.

## Fix Accuracy committed-word scoring

`calculateCommittedScore` delegates to `calculateScore` for the full input and for the committed portion. Unless `finalizeCurrentWord` is true or the source ends in whitespace, it excludes the unfinished current word from the committed text. It uses committed errors for the penalty/error total while using the full input's measured keystrokes and gross WPM. This preserves the game behavior where a word is checked when the user commits it.

## Required regression coverage

Keep tests in `tests/scoring-regression.test.cjs` and expand coverage for:

- Perfect transcript parity between BSF and CRPF.
- Internal omissions versus trailing not-reached words.
- Substitution alignment and repeated words.
- Repeated spaces and extra words.
- Empty input and zero/negative duration.
- Unicode words and punctuation/capitalization classifications.
- Keystroke caps so excess characters and words cannot inflate speed.
- Configured allowance values, once the intended exam rule is confirmed.
- Browser/server parity and committed-word behavior.

## Change-control rule

The master file is the sole formula source. Update this specification and regression tests in the same change as an approved formula modification. Do not implement formula copies in individual test pages, and do not silently treat a code comment/default configuration as proof of the governing exam rule.
