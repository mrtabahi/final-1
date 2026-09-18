/**
 * Decoding HCM - BSF-style typing scorer
 *
 * Important scoring behavior:
 * - Words are compared by sequence alignment, NOT fixed indexes.
 * - One omitted word = 1 error; following correctly typed words can still match.
 * - One extra word = 1 error.
 * - One wrong word = 1 error.
 * - Every run of 2+ consecutive spaces = 1 whitespace error.
 * - 5% permissible errors and 10-word excess-error penalty are configurable.
 */

const ScoringEngine = {
    tokenize(text) {
        const source = String(text ?? "");
        const re = /\S+/gu;
        const words = [];
        let m;
        while ((m = re.exec(source)) !== null) {
            words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
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
     * Returns match/substitution/deletion/insertion operations.
     */
    alignWords(expectedWords, typedWords) {
        const n = expectedWords.length;
        const m = typedWords.length;
        const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
        const op = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));

        for (let i = 1; i <= n; i++) { dp[i][0] = i; op[i][0] = "delete"; }
        for (let j = 1; j <= m; j++) { dp[0][j] = j; op[0][j] = "insert"; }

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

                // Prefer substitution, then deletion, then insertion. This keeps
                // a skipped word from shifting all following correct words.
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
            const action = i === 0 ? "insert" : j === 0 ? "delete" : op[i][j];
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

    calculateScore(expectedText, typedText, durationSeconds, config = {}) {
        const freePct = Number(config.freeErrorPct ?? CONFIG.DEFAULT_FREE_ERROR_PCT);
        const penaltyMultiplier = Number(config.penaltyPerError ?? CONFIG.DEFAULT_PENALTY_PER_ERROR);
        const minAccuracy = config.minAccuracy === null || config.minAccuracy === undefined || config.minAccuracy === ""
            ? null : Number(config.minAccuracy);
        const targetWpm = config.targetWpm === null || config.targetWpm === undefined || config.targetWpm === ""
            ? null : Number(config.targetWpm);

        const elapsedSeconds = Math.max(Number(durationSeconds) || 0, 0.001);
        const elapsedMinutes = elapsedSeconds / 60;
        const expected = this.tokenize(expectedText);
        const typed = this.tokenize(typedText);
        const expectedWords = expected.map(x => x.word);
        const typedWords = typed.map(x => x.word);
        const alignment = this.alignWords(expectedWords, typedWords);

        const wordErrors = alignment.reduce((sum, item) => sum + (item.type === "match" ? 0 : 1), 0);
        const doubleSpaceErrors = this.countDoubleSpaceErrors(typedText);
        const totalErrors = wordErrors + doubleSpaceErrors;

        // Character accuracy is useful for feedback, but word-level errors are
        // the basis of the BSF-style penalty calculation.
        const totalTypedChars = String(typedText ?? "").length;
        const expectedChars = String(expectedText ?? "");
        let correctChars = 0;
        const maxChars = Math.min(expectedChars.length, totalTypedChars);
        for (let i = 0; i < maxChars; i++) {
            if (expectedChars[i] === typedText[i]) correctChars++;
        }
        const incorrectChars = Math.max(0, totalTypedChars - correctChars) + Math.max(0, expectedChars.length - totalTypedChars);

        const freeErrors = Math.floor(typedWords.length * freePct);
        const excessErrors = Math.max(0, totalErrors - freeErrors);
        const penaltyWords = excessErrors * penaltyMultiplier;
        const netWords = Math.max(0, typedWords.length - penaltyWords);
        const grossWpm = Number((typedWords.length / elapsedMinutes).toFixed(2));
        const netWpm = Number((netWords / elapsedMinutes).toFixed(2));
        const accuracy = totalTypedChars > 0
            ? Number(((correctChars / totalTypedChars) * 100).toFixed(2))
            : 0;

        const passedByWpm = targetWpm === null ? true : netWpm >= targetWpm;
        const passedByAccuracy = minAccuracy === null ? true : accuracy >= minAccuracy;
        const passed = passedByWpm && passedByAccuracy;

        return {
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
            passed
        };
    },

    getPerformanceLabel(score) {
        if (score.passed) return { text: "QUALIFIED", class: "badge-success" };
        return { text: "NOT QUALIFIED", class: "badge-danger" };
    }
};
