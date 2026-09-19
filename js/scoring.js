/**
 * Decoding HCM - BSF HCM 2024-style typing scorer
 *
 * Error detection:
 * - Words are compared by sequence alignment.
 * - One omitted word = 1 error.
 * - One extra word = 1 error.
 * - One wrong/different word = 1 error.
 * - Repeated word = 1 error.
 * - Word mixing-up = handled through alignment.
 * - Double-space runs = 1 whitespace error.
 *
 * Speed calculation:
 * - 5 key depressions = 1 equivalent word.
 * - Gross words = total key depressions / 5.
 * - 5% of actually typed equivalent words = permissible errors.
 * - Every error beyond permissible limit = 10 words deducted.
 *
 * Important:
 * Error detection remains word-based.
 * Speed calculation is keystroke-based.
 */

const ScoringEngine = {

    tokenize(text) {
        const source = String(text ?? "");
        const re = /\S+/gu;
        const words = [];
        let m;

        while ((m = re.exec(source)) !== null) {
            words.push({
                word: m[0],
                start: m.index,
                end: m.index + m[0].length
            });
        }

        return words;
    },

    countDoubleSpaceErrors(text) {
        const source = String(text ?? "");
        const runs = source.match(/ {2,}/g);
        return runs ? runs.length : 0;
    },

    /**
     * Levenshtein-style word alignment.
     *
     * Returns:
     * match
     * substitute
     * delete
     * insert
     */
    alignWords(expectedWords, typedWords) {

        const n = expectedWords.length;
        const m = typedWords.length;

        const dp = Array.from(
            { length: n + 1 },
            () => Array(m + 1).fill(0)
        );

        const op = Array.from(
            { length: n + 1 },
            () => Array(m + 1).fill(null)
        );

        for (let i = 1; i <= n; i++) {
            dp[i][0] = i;
            op[i][0] = "delete";
        }

        for (let j = 1; j <= m; j++) {
            dp[0][j] = j;
            op[0][j] = "insert";
        }

        for (let i = 1; i <= n; i++) {

            for (let j = 1; j <= m; j++) {

                if (expectedWords[i - 1] === typedWords[j - 1]) {

                    dp[i][j] = dp[i - 1][j - 1];
                    op[i][j] = "match";

                    continue;
                }

                const substitute =
                    dp[i - 1][j - 1] + 1;

                const del =
                    dp[i - 1][j] + 1;

                const ins =
                    dp[i][j - 1] + 1;

                const best =
                    Math.min(substitute, del, ins);

                /*
                 * Prefer substitution first.
                 * Then deletion.
                 * Then insertion.
                 *
                 * This prevents one omitted word from causing
                 * every following correct word to become wrong.
                 */
                if (best === substitute) {

                    dp[i][j] = substitute;
                    op[i][j] = "substitute";

                } else if (best === del) {

                    dp[i][j] = del;
                    op[i][j] = "delete";

                } else {

                    dp[i][j] = ins;
                    op[i][j] = "insert";
                }
            }
        }

        const operations = [];

        let i = n;
        let j = m;

        while (i > 0 || j > 0) {

            const action =
                i === 0
                    ? "insert"
                    : j === 0
                        ? "delete"
                        : op[i][j];

            if (action === "match") {

                operations.unshift({
                    type: "match",
                    expected: expectedWords[i - 1],
                    typed: typedWords[j - 1]
                });

                i--;
                j--;

            } else if (action === "substitute") {

                operations.unshift({
                    type: "substitute",
                    expected: expectedWords[i - 1],
                    typed: typedWords[j - 1]
                });

                i--;
                j--;

            } else if (action === "delete") {

                operations.unshift({
                    type: "delete",
                    expected: expectedWords[i - 1],
                    typed: null
                });

                i--;

            } else {

                operations.unshift({
                    type: "insert",
                    expected: null,
                    typed: typedWords[j - 1]
                });

                j--;
            }
        }

        return operations;
    },

    /**
     * Calculate BSF HCM-style typing score.
     *
     * totalKeystrokes MUST come from the typing input engine.
     *
     * 5 key depressions = 1 equivalent word.
     */
    calculateScore(
        expectedText,
        typedText,
        durationSeconds,
        config = {},
        totalKeystrokes = null
    ) {

        const freePct = Number(
            config.freeErrorPct ??
            CONFIG.DEFAULT_FREE_ERROR_PCT ??
            0.05
        );

        const penaltyMultiplier = Number(
            config.penaltyPerError ??
            CONFIG.DEFAULT_PENALTY_PER_ERROR ??
            10
        );

        const minAccuracy =
            config.minAccuracy === null ||
            config.minAccuracy === undefined ||
            config.minAccuracy === ""
                ? null
                : Number(config.minAccuracy);

        const targetWpm =
            config.targetWpm === null ||
            config.targetWpm === undefined ||
            config.targetWpm === ""
                ? null
                : Number(config.targetWpm);

        const elapsedSeconds =
            Math.max(Number(durationSeconds) || 0, 0.001);

        const elapsedMinutes =
            elapsedSeconds / 60;

        /*
         * ---------------------------------------------------------
         * 1. TOKENIZE
         * ---------------------------------------------------------
         */

        const expected = this.tokenize(expectedText);
        const typed = this.tokenize(typedText);

        const expectedWords =
            expected.map(x => x.word);

        const typedWords =
            typed.map(x => x.word);

        /*
         * ---------------------------------------------------------
         * 2. WORD ALIGNMENT
         * ---------------------------------------------------------
         */

        const alignment =
            this.alignWords(
                expectedWords,
                typedWords
            );

        /*
         * ---------------------------------------------------------
         * 3. COUNT ACTUAL ERRORS
         * ---------------------------------------------------------
         */

        let wordErrors = 0;

        for (let i = 0; i < alignment.length; i++) {

            const item = alignment[i];

            if (item.type === "match") {
                continue;
            }

            /*
             * Words remaining at the end because the candidate
             * ran out of time are not counted as mistakes.
             */
            if (item.type === "delete") {

                const hasLaterTypedOperation =
                    alignment
                        .slice(i + 1)
                        .some(op => op.type !== "delete");

                if (!hasLaterTypedOperation) {
                    continue;
                }
            }

            wordErrors++;
        }

        /*
         * ---------------------------------------------------------
         * 4. WHITESPACE ERRORS
         * ---------------------------------------------------------
         */

        const doubleSpaceErrors =
            this.countDoubleSpaceErrors(typedText);

        /*
         * Total mistakes
         */
        const totalErrors =
            wordErrors +
            doubleSpaceErrors;

        /*
         * ---------------------------------------------------------
         * 5. KEY DEPRESSIONS
         * ---------------------------------------------------------
         *
         * IMPORTANT:
         *
         * totalKeystrokes should ideally be supplied by the
         * actual typing input handler.
         *
         * If not supplied, fallback to text length is used only
         * for compatibility, NOT as a perfect physical key count.
         */

        const typedString =
            String(typedText ?? "");

        const measuredKeystrokes =
            Number.isFinite(Number(totalKeystrokes))
                ? Math.max(0, Number(totalKeystrokes))
                : typedString.length;

        /*
         * ---------------------------------------------------------
         * 6. BSF EQUIVALENT WORDS
         * ---------------------------------------------------------
         *
         * 5 key depressions = 1 word.
         */

        const equivalentTypedWords =
            measuredKeystrokes / 5;

        /*
         * ---------------------------------------------------------
         * 7. PERMISSIBLE 5% ERRORS
         * ---------------------------------------------------------
         *
         * BSF rule:
         * 5% of words actually typed.
         *
         * Example:
         * 1500 key depressions
         * = 300 words
         * 5% = 15 permissible errors
         */

        const freeErrors =
            Math.floor(
                equivalentTypedWords * freePct
            );

        /*
         * ---------------------------------------------------------
         * 8. EXCESS ERRORS
         * ---------------------------------------------------------
         */

        const excessErrors =
            Math.max(
                0,
                totalErrors - freeErrors
            );

        /*
         * ---------------------------------------------------------
         * 9. 10 WORD PENALTY
         * ---------------------------------------------------------
         *
         * Every mistake beyond permissible limit
         * = 10 words deducted.
         */

        const penaltyWords =
            excessErrors * penaltyMultiplier;

        /*
         * ---------------------------------------------------------
         * 10. NET WORDS
         * ---------------------------------------------------------
         */

        const netWords =
            Math.max(
                0,
                equivalentTypedWords - penaltyWords
            );

        /*
         * ---------------------------------------------------------
         * 11. GROSS WPM
         * ---------------------------------------------------------
         */

        const grossWpm =
            Number(
                (equivalentTypedWords / elapsedMinutes)
                    .toFixed(2)
            );

        /*
         * ---------------------------------------------------------
         * 12. NET WPM
         * ---------------------------------------------------------
         */

        const netWpm =
            Number(
                (netWords / elapsedMinutes)
                    .toFixed(2)
            );

        /*
         * ---------------------------------------------------------
         * 13. CHARACTER FEEDBACK
         * ---------------------------------------------------------
         *
         * Kept for UI feedback.
         * This does NOT determine BSF speed.
         */

        const expectedChars =
            String(expectedText ?? "");

        let correctChars = 0;

        const maxChars =
            Math.min(
                expectedChars.length,
                typedString.length
            );

        for (let i = 0; i < maxChars; i++) {

            if (
                expectedChars[i] ===
                typedString[i]
            ) {
                correctChars++;
            }
        }

        const incorrectChars =
            Math.max(
                0,
                typedString.length -
                correctChars
            ) +
            Math.max(
                0,
                expectedChars.length -
                typedString.length
            );

        /*
         * ---------------------------------------------------------
         * 14. ACCURACY
         * ---------------------------------------------------------
         */

        const accuracy =
            measuredKeystrokes > 0
                ? Number(
                    (
                        (correctChars /
                            measuredKeystrokes) *
                        100
                    ).toFixed(2)
                )
                : 0;

        /*
         * ---------------------------------------------------------
         * 15. PASS CONDITIONS
         * ---------------------------------------------------------
         */

        const passedByWpm =
            targetWpm === null
                ? true
                : netWpm >= targetWpm;

        const passedByAccuracy =
            minAccuracy === null
                ? true
                : accuracy >= minAccuracy;

        const passed =
            passedByWpm &&
            passedByAccuracy;

        return {

            /*
             * Raw typing data
             */
            totalTypedWords: typedWords.length,

            totalTypedChars:
                typedString.length,

            totalKeystrokes:
                measuredKeystrokes,

            /*
             * BSF equivalent words
             */
            equivalentTypedWords:
                Number(
                    equivalentTypedWords.toFixed(2)
                ),

            /*
             * Character feedback
             */
            correctChars,
            incorrectChars,

            /*
             * Errors
             */
            wordErrors,
            doubleSpaceErrors,
            totalErrors,

            /*
             * BSF 5% rule
             */
            freeErrors,
            excessErrors,

            /*
             * 10-word penalty
             */
            penaltyWords,

            /*
             * Final words
             */
            netWords:
                Number(netWords.toFixed(2)),

            /*
             * Speed
             */
            grossWpm,
            netWpm,

            /*
             * Accuracy
             */
            accuracy,

            elapsedMinutes,

            /*
             * Detailed analysis
             */
            alignment,

            minAccuracy,
            targetWpm,

            passedByWpm,
            passedByAccuracy,
            passed
        };
    },

    getPerformanceLabel(score) {

        if (score.passed) {
            return {
                text: "QUALIFIED",
                class: "badge-success"
            };
        }

        return {
            text: "NOT QUALIFIED",
            class: "badge-danger"
        };
    }
};
