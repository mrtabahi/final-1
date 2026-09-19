/**
 * Decoding HCM - BSF HCM 2024-style typing scorer
 *
 * BSF HCM 2024 relevant rules:
 * - English: 35 WPM = 10500 KDPH
 * - Hindi:   30 WPM = 9000 KDPH
 * - Average 5 key depressions = 1 word
 * - 5% of actually typed words are permissible mistakes
 * - Every mistake beyond the permissible limit deducts 10 words
 * - Each mistake may include spelling error, omitted word/punctuation,
 *   repeated word, extra word, word differing from passage, etc.
 *
 * IMPORTANT:
 * "5 key depressions = 1 word" is used for SPEED calculation.
 * Errors are still counted according to the typed passage/words.
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
     * - match
     * - substitute
     * - delete
     * - insert
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

                const substitute = dp[i - 1][j - 1] + 1;
                const del = dp[i - 1][j] + 1;
                const ins = dp[i][j - 1] + 1;

                const best = Math.min(
                    substitute,
                    del,
                    ins
                );

                // Prefer substitution, then deletion, then insertion.
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
     * Calculate score according to BSF HCM 2024-style rules.
     *
     * config:
     * {
     *   freeErrorPct: 0.05,
     *   penaltyPerError: 10,
     *   minAccuracy: null,
     *   targetWpm: 35,
     *   keyDepressionsPerWord: 5,
     *   keyDepressions: null
     * }
     */
    calculateScore(expectedText, typedText, durationSeconds, config = {}) {

        const freePct = Number(
            config.freeErrorPct ?? CONFIG.DEFAULT_FREE_ERROR_PCT ?? 0.05
        );

        const penaltyMultiplier = Number(
            config.penaltyPerError ?? CONFIG.DEFAULT_PENALTY_PER_ERROR ?? 10
        );

        const keyDepressionsPerWord = Number(
            config.keyDepressionsPerWord ?? 5
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

        const elapsedSeconds = Math.max(
            Number(durationSeconds) || 0,
            0.001
        );

        const elapsedMinutes = elapsedSeconds / 60;

        const expected = this.tokenize(expectedText);
        const typed = this.tokenize(typedText);

        const expectedWords = expected.map(x => x.word);
        const typedWords = typed.map(x => x.word);

        const alignment = this.alignWords(
            expectedWords,
            typedWords
        );

        /*
         * ------------------------------------------------------------
         * 1. COUNT ERRORS
         * ------------------------------------------------------------
         */

        let wordErrors = 0;

        for (let i = 0; i < alignment.length; i++) {

            const item = alignment[i];

            if (item.type === "match") {
                continue;
            }

            if (item.type === "delete") {

                const hasLaterTypedOperation = alignment
                    .slice(i + 1)
                    .some(op => op.type !== "delete");

                /*
                 * Words remaining after the candidate stopped typing
                 * are not counted as mistakes.
                 */
                if (!hasLaterTypedOperation) {
                    continue;
                }
            }

            wordErrors++;
        }

        /*
         * Keep your existing double-space reporting.
         *
         * NOTE:
         * This is kept separately for UI/reporting compatibility.
         * If you want exact BSF-style mistake calculation, it should
         * NOT automatically be added as a separate error unless your
         * test rules specifically define it that way.
         */
        const doubleSpaceErrors =
            this.countDoubleSpaceErrors(typedText);

        /*
         * For BSF-style scoring, actual passage/word mistakes are used.
         *
         * Therefore double-space errors are NOT automatically added
         * here as an independent mistake.
         */
        const totalErrors = wordErrors;

        /*
         * ------------------------------------------------------------
         * 2. KEY DEPRESSIONS
         * ------------------------------------------------------------
         *
         * BSF conversion:
         *
         * 5 key depressions = 1 word
         *
         * If keyDepressions is explicitly supplied by the typing
         * application, use it.
         *
         * Otherwise fall back to typedText.length.
         *
         * IMPORTANT:
         * typedText.length is only an approximation of actual
         * key depressions if backspace/delete/correction is allowed.
         */
        const totalTypedChars =
            config.keyDepressions !== null &&
            config.keyDepressions !== undefined
                ? Math.max(
                    0,
                    Number(config.keyDepressions) || 0
                )
                : String(typedText ?? "").length;

        /*
         * Gross words according to BSF KDPH method.
         */
        const grossWords =
            totalTypedChars / keyDepressionsPerWord;

        /*
         * ------------------------------------------------------------
         * 3. PERMISSIBLE ERRORS
         * ------------------------------------------------------------
         *
         * Notification:
         * mistakes equal to 5% of words actually typed
         * are permissible.
         *
         * Example:
         * 350 typed words
         * 5% = 17.5
         *
         * We use floor so only complete permissible errors count.
         */
        const freeErrors = Math.floor(
            grossWords * freePct
        );

        /*
         * ------------------------------------------------------------
         * 4. EXCESS ERRORS
         * ------------------------------------------------------------
         */

        const excessErrors = Math.max(
            0,
            totalErrors - freeErrors
        );

        /*
         * Every excess mistake = 10 words deduction.
         */
        const penaltyWords =
            excessErrors * penaltyMultiplier;

        /*
         * ------------------------------------------------------------
         * 5. NET WORDS
         * ------------------------------------------------------------
         */

        const netWords = Math.max(
            0,
            grossWords - penaltyWords
        );

        /*
         * ------------------------------------------------------------
         * 6. SPEED
         * ------------------------------------------------------------
         */

        const grossWpm = Number(
            (grossWords / elapsedMinutes).toFixed(2)
        );

        const netWpm = Number(
            (netWords / elapsedMinutes).toFixed(2)
        );

        /*
         * ------------------------------------------------------------
         * 7. CHARACTER ACCURACY
         * ------------------------------------------------------------
         *
         * Kept for UI/feedback compatibility.
         * This is NOT the BSF WPM calculation.
         */
        const typedSource = String(typedText ?? "");
        const expectedSource = String(expectedText ?? "");

        let correctChars = 0;

        const maxChars = Math.min(
            expectedSource.length,
            typedSource.length
        );

        for (let i = 0; i < maxChars; i++) {

            if (expectedSource[i] === typedSource[i]) {
                correctChars++;
            }
        }

        const incorrectChars =
            Math.max(
                0,
                typedSource.length - correctChars
            ) +
            Math.max(
                0,
                expectedSource.length - typedSource.length
            );

        const accuracy =
            typedSource.length > 0
                ? Number(
                    (
                        (correctChars / typedSource.length) *
                        100
                    ).toFixed(2)
                )
                : 0;

        /*
         * ------------------------------------------------------------
         * 8. PASS / FAIL
         * ------------------------------------------------------------
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
            passedByWpm && passedByAccuracy;

        return {

            /*
             * Original compatibility fields
             */
            totalTypedWords: typedWords.length,

            totalTypedChars,

            correctChars,

            incorrectChars,

            wordErrors,

            doubleSpaceErrors,

            totalErrors,

            freeErrors,

            excessErrors,

            penaltyWords,

            netWords,

            grossWpm,

            netWpm,

            accuracy,

            elapsedMinutes,

            alignment,

            minAccuracy,

            targetWpm,

            passedByWpm,

            passedByAccuracy,

            passed,

            /*
             * New BSF/KDPH fields
             */
            keyDepressions: totalTypedChars,

            keyDepressionsPerWord,

            grossWords,

            /*
             * Useful diagnostic information
             */
            permissibleErrorPct: freePct,

            penaltyPerExcessError: penaltyMultiplier
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
