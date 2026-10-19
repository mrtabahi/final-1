/**
 * Decoding HCM - BSF HCM 2024-style typing scorer (Optimized & Debugged)
 *
 * Error detection:
 * - Words are compared by sequence alignment (Levenshtein distance).
 * - Unattempted words at the end are strictly ignored from errors.
 * - Double-space runs = 1 whitespace error.
 *
 * Speed calculation:
 * - 5 key depressions = 1 equivalent word.
 * - Gross words = total key depressions / 5.
 * - 5% of actually typed equivalent words = permissible errors.
 * - Every error beyond permissible limit = 10 words deducted.
 */

const ScoringEngine = {

    tokenize(text) {
        const source = String(text ?? "");
        const re = /\S+/gu;
        const words = [];
        let m;

        // FIXED: Resolved infinite loop bug by using m[0] and proper length indexing
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
     */
    alignWords(expectedWords, typedWords) {
        const n = expectedWords.length;
        const m = typedWords.length;

        const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
        const op = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));

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
                const best = Math.min(substitute, del, ins);

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
        let i = n, j = m;

        while (i > 0 || j > 0) {
            const action = (i === 0) ? "insert" : (j === 0) ? "delete" : op[i][j];

            if (action === "match") {
                operations.unshift({ type: "match", expected: expectedWords[i - 1], typed: typedWords[j - 1] });
                i--; j--;
            } else if (action === "substitute") {
                operations.unshift({ type: "substitute", expected: expectedWords[i - 1], typed: typedWords[j - 1] });
                i--; j--;
            } else if (action === "delete") {
                operations.unshift({ type: "delete", expected: expectedWords[i - 1], typed: null });
                i--;
            } else {
                operations.unshift({ type: "insert", expected: null, typed: typedWords[j - 1] });
                j--;
            }
        }

        return operations;
    },

    calculateScore(expectedText, typedText, durationSeconds, config = {}, totalKeystrokes = null) {
        const freePct = Number(config.freeErrorPct ?? 0.05);
        const penaltyMultiplier = Number(config.penaltyPerError ?? 10);
        
        const minAccuracy = (config.minAccuracy === null || config.minAccuracy === undefined || config.minAccuracy === "") ? null : Number(config.minAccuracy);
        const targetWpm = (config.targetWpm === null || config.targetWpm === undefined || config.targetWpm === "") ? null : Number(config.targetWpm);

        const elapsedSeconds = Math.max(Number(durationSeconds) || 0, 0.001);
        const elapsedMinutes = elapsedSeconds / 60;

        const expected = this.tokenize(expectedText);
        const typed = this.tokenize(typedText);

        const expectedWords = expected.map(x => x.word);
        const typedWords = typed.map(x => x.word);

        const alignment = this.alignWords(expectedWords, typedWords);

        /*
         * ---------------------------------------------------------
         * ERRORS COUNT LOGIC (FIXED)
         * ---------------------------------------------------------
         */
        let wordErrors = 0;
        for (let i = 0; i < alignment.length; i++) {
            const item = alignment[i];

            if (item.type === "match") continue;

            // Strict check: Bacha hua para agar end me aata hai to use skip maana jaye error nahi
            if (item.type === "delete") {
                const hasLaterTypedOperation = alignment
                    .slice(i)
                    .some(op => op.type === "match" || op.type === "substitute" || op.type === "insert");

                if (!hasLaterTypedOperation) continue;
            }

            wordErrors++;
        }

        const doubleSpaceErrors = this.countDoubleSpaceErrors(typedText);
        const totalErrors = wordErrors + doubleSpaceErrors;

        /*
         * ---------------------------------------------------------
         * KEYSTROKES & WORDS CALCULATION
         * ---------------------------------------------------------
         */
        const typedString = String(typedText ?? "");
        const measuredKeystrokes = Number.isFinite(Number(totalKeystrokes)) && Number(totalKeystrokes) > 0
            ? Math.max(0, Number(totalKeystrokes))
            : typedString.length;

        const equivalentTypedWords = measuredKeystrokes / 5;
        const freeErrors = Math.floor(equivalentTypedWords * freePct);
        const excessErrors = Math.max(0, totalErrors - freeErrors);
        const penaltyWords = excessErrors * penaltyMultiplier;
        
        const netWords = Math.max(0, equivalentTypedWords - penaltyWords);

        const grossWpm = Number((equivalentTypedWords / elapsedMinutes).toFixed(2));
        const netWpm = Number((netWords / elapsedMinutes).toFixed(2));

        /*
         * ---------------------------------------------------------
         * CHARACTER FEEDBACK (UI PURPOSE)
         * ---------------------------------------------------------
         */
        const expectedChars = String(expectedText ?? "");
        let correctChars = 0;
        const maxChars = Math.min(expectedChars.length, typedString.length);

        for (let i = 0; i < maxChars; i++) {
            if (expectedChars[i] === typedString[i]) {
                correctChars++;
            }
        }

        const incorrectChars = Math.max(0, typedString.length - correctChars) +
                               Math.max(0, expectedChars.length - typedString.length);

        /*
         * ---------------------------------------------------------
         * STANDARD TYPING ACCURACY FORMULA (FIXED)
         * ---------------------------------------------------------
         * Real-world formula based on total typed equivalent words and total errors.
         */
        let accuracy = 100;
        if (equivalentTypedWords > 0) {
            // Standard typing examination logic
            const calculatedAcc = ((equivalentTypedWords - totalErrors) / equivalentTypedWords) * 100;
            accuracy = Number(Math.max(0, calculatedAcc).toFixed(2));
        } else {
            accuracy = 0;
        }

        const passedByWpm = targetWpm === null ? true : netWpm >= targetWpm;
        const passedByAccuracy = minAccuracy === null ? true : accuracy >= minAccuracy;
        const passed = passedByWpm && passedByAccuracy;

        return {
            totalTypedWords: typedWords.length,
            totalTypedChars: typedString.length,
            totalKeystrokes: measuredKeystrokes,
            equivalentTypedWords: Number(equivalentTypedWords.toFixed(2)),
            correctChars,
            incorrectChars,
            wordErrors,
            doubleSpaceErrors,
            totalErrors,
            freeErrors,
            excessErrors,
            penaltyWords,
            netWords: Number(netWords.toFixed(2)),
            grossWpm,
            netWpm,
            accuracy,
            elapsedMinutes,
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
            return { text: "QUALIFIED", class: "badge-success" };
        }
        return { text: "NOT QUALIFIED", class: "badge-danger" };
    }
};
