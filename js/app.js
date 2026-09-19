document.addEventListener('DOMContentLoaded', async () => {

    const status = await AuthManager.requireCandidateGuard();
    if (!status.ok) return;

    const { user, profile } = status;

    let currentPassage = null;
    let engine = null;
    let tests = [];

    /*
     * ------------------------------------------------------------
     * DOM
     * ------------------------------------------------------------
     */

    const $ = id => document.getElementById(id);

    const setup = $('setup-section');
    const inst = $('instruction-section');
    const typing = $('typing-section');
    const result = $('result-section');

    const passageSelect = $('select-passage');
    const lang = $('select-language');
    const duration = $('select-duration');
    const textarea = $('typing-textarea');
    const display = $('passage-container');


    /*
     * ------------------------------------------------------------
     * BSF HCM 2024 SCORING CONSTANTS
     * ------------------------------------------------------------
     *
     * 5 key depressions = 1 word
     * 5% permissible errors
     * 10 words deduction per excess error
     *
     * Target:
     * English = 35 WPM
     * Hindi   = 30 WPM
     *
     * These can still be overridden by admin test settings.
     * ------------------------------------------------------------
     */

    const BSF_SCORING = {
        keyDepressionsPerWord: 5,
        freeErrorPct: 0.05,
        penaltyPerError: 10,

        englishTargetWpm: 35,
        hindiTargetWpm: 30
    };


    /*
     * ------------------------------------------------------------
     * ACTUAL KEY DEPRESSION COUNTER
     * ------------------------------------------------------------
     *
     * IMPORTANT:
     * typedText.length is NOT necessarily the same thing as
     * key depressions.
     *
     * Example:
     *
     * a b c BACKSPACE d
     *
     * Final text length and actual key presses are different.
     *
     * We therefore maintain a separate counter.
     * ------------------------------------------------------------
     */

    let keyDepressions = 0;

    /*
     * Prevent counting keys after test has ended.
     */
    let testActive = false;


    /*
     * ------------------------------------------------------------
     * INPUT RESTRICTIONS
     * ------------------------------------------------------------
     */

    textarea.addEventListener('paste', e => {
        e.preventDefault();
        alert('Pasting is disabled for this typing test.');
    });

    textarea.addEventListener('drop', e => {
        e.preventDefault();
    });

    textarea.addEventListener('contextmenu', e => {
        e.preventDefault();
    });


    /*
     * ------------------------------------------------------------
     * COUNT KEY DEPRESSIONS
     * ------------------------------------------------------------
     *
     * Count every physical key depression that produces a
     * character/space.
     *
     * If your exact exam implementation requires BACKSPACE,
     * DELETE, ENTER etc. to also count as key depressions,
     * those can be added here.
     *
     * For normal typing-speed calculation:
     * character + space = key depression.
     * ------------------------------------------------------------
     */

    textarea.addEventListener('keydown', e => {

        if (!testActive) return;

        /*
         * Normal printable characters.
         *
         * e.key.length === 1 catches:
         * a-z
         * A-Z
         * numbers
         * punctuation
         * space
         * Hindi Unicode characters represented by the browser
         */
        if (e.key.length === 1) {
            keyDepressions++;
        }
    });


    /*
     * ------------------------------------------------------------
     * LOAD TESTS
     * ------------------------------------------------------------
     */

    async function loadTests() {

        const {
            data,
            error
        } = await supabaseClient
            .from('tests')
            .select('*')
            .eq('active', true)
            .order('created_at', {
                ascending: false
            });

        if (error) {
            passageSelect.innerHTML =
                '<option value="">Unable to load tests</option>';
            return;
        }

        tests = data || [];
        render();
    }


    /*
     * ------------------------------------------------------------
     * RENDER TEST LIST
     * ------------------------------------------------------------
     */

    function render() {

        const filtered = tests.filter(
            t => t.language === lang.value
        );

        passageSelect.innerHTML = filtered.length
            ? ''
            : '<option value="">No active tests</option>';

        filtered.forEach(t => {

            const o = document.createElement('option');

            o.value = t.id;
            o.textContent = t.title;

            passageSelect.appendChild(o);
        });

        const q =
            new URLSearchParams(location.search).get('test');

        if (
            q &&
            filtered.some(t => t.id === q)
        ) {
            passageSelect.value = q;
        }

        update();
    }


    /*
     * ------------------------------------------------------------
     * UPDATE TEST INFORMATION
     * ------------------------------------------------------------
     */

    function update() {

        const t = tests.find(
            x => x.id === passageSelect.value
        );

        if (!t) return;

        duration.value =
            `${t.duration_minutes} minute${t.duration_minutes === 1 ? '' : 's'} (fixed by admin)`;
    }


    lang.onchange = render;
    passageSelect.onchange = update;

    await loadTests();


    /*
     * ------------------------------------------------------------
     * EXAM CONFIG
     * ------------------------------------------------------------
     */

    $('exam-config-form').onsubmit = async e => {

        e.preventDefault();

        const id = passageSelect.value;

        const {
            data,
            error
        } = await supabaseClient
            .from('tests')
            .select('*')
            .eq('id', id)
            .eq('active', true)
            .single();

        if (error || !data) {
            alert('Unable to load this test.');
            return;
        }

        currentPassage = data;

        setup.style.display = 'none';
        inst.style.display = 'block';
    };


    /*
     * ------------------------------------------------------------
     * START TEST
     * ------------------------------------------------------------
     */

    $('btn-start-test').onclick = () => {

        if (!currentPassage) return;

        inst.style.display = 'none';
        typing.style.display = 'block';

        textarea.value = '';

        /*
         * RESET KEY DEPRESSION COUNTER
         */
        keyDepressions = 0;
        testActive = true;

        const name = profile.full_name;

        const mode =
            currentPassage.mode || 'screen';

        const durationMin =
            Number(
                currentPassage.duration_minutes || 10
            );


        /*
         * --------------------------------------------------------
         * BSF SCORING CONFIG
         * --------------------------------------------------------
         *
         * Admin values are retained if present.
         * Otherwise BSF HCM 2024 defaults are used.
         */

        const cfg = {

            /*
             * 5% permissible errors
             */
            freeErrorPct:
                currentPassage.free_error_pct ??
                BSF_SCORING.freeErrorPct,

            /*
             * 10 words deduction per excess error
             */
            penaltyPerError:
                currentPassage.penalty_per_error ??
                BSF_SCORING.penaltyPerError,

            /*
             * BSF conversion
             */
            keyDepressionsPerWord:
                5,

            /*
             * Actual key depressions will be supplied
             * separately during scoring.
             */

            minAccuracy:
                currentPassage.min_accuracy,

            /*
             * If admin has explicitly set targetWpm,
             * use it.
             *
             * Otherwise:
             * English = 35
             * Hindi   = 30
             */

            targetWpm:
                currentPassage.target_wpm ??
                (
                    String(currentPassage.language || '')
                        .toLowerCase()
                        .includes('hindi')
                        ? BSF_SCORING.hindiTargetWpm
                        : BSF_SCORING.englishTargetWpm
                )
        };


        /*
         * --------------------------------------------------------
         * DISPLAY
         * --------------------------------------------------------
         */

        $('disp-candidate-name').textContent = name;

        $('disp-test-title').textContent =
            currentPassage.title;

        $('disp-mode').textContent =
            mode === 'page'
                ? 'Off Screen'
                : 'On Screen';


        if (mode === 'page') {

            $('offscreen-alert').style.display = 'block';
            display.style.display = 'none';

        } else {

            $('offscreen-alert').style.display = 'none';
            display.style.display = 'block';

            display.textContent =
                currentPassage.passage;
        }


        /*
         * --------------------------------------------------------
         * TYPING ENGINE
         * --------------------------------------------------------
         */

        engine = new TypingEngine({

            passageText:
                currentPassage.passage,

            durationSeconds:
                durationMin * 60,

            mode,

            scoringConfig: cfg,


            /*
             * ----------------------------------------------------
             * LIVE TICK
             * ----------------------------------------------------
             */

            onTick: (remaining, elapsed) => {

                const m =
                    Math.floor(
                        remaining / 60
                    )
                    .toString()
                    .padStart(2, '0');

                const s =
                    (remaining % 60)
                    .toString()
                    .padStart(2, '0');

                $('timer-display').textContent =
                    `${m}:${s}`;


                /*
                 * IMPORTANT:
                 *
                 * Send actual key depressions to scorer.
                 */

                const liveCfg = {
                    ...cfg,
                    keyDepressions
                };


                const st =
                    ScoringEngine.calculateScore(
                        currentPassage.passage,
                        textarea.value,
                        elapsed || 0.001,
                        liveCfg
                    );


                $('live-gross-wpm').textContent =
                    st.grossWpm;

                $('live-net-wpm').textContent =
                    st.netWpm;

                $('live-accuracy').textContent =
                    `${st.accuracy}%`;

                $('live-errors').textContent =
                    st.totalErrors;
            },


            /*
             * ----------------------------------------------------
             * TEST COMPLETE
             * ----------------------------------------------------
             */

            onComplete: async res => {

                testActive = false;

                typing.style.display = 'none';
                result.style.display = 'block';


                /*
                 * Recalculate final score using the FINAL
                 * key-depression count.
                 *
                 * This prevents the final score from depending
                 * on an outdated live value.
                 */

                const finalScore =
                    ScoringEngine.calculateScore(
                        currentPassage.passage,
                        res.typedText || textarea.value,
                        res.elapsedSeconds || 0.001,
                        {
                            ...cfg,
                            keyDepressions
                        }
                    );


                /*
                 * Keep result object compatible with
                 * existing submitAttempt().
                 */

                const finalResult = {
                    ...res,
                    score: finalScore
                };


                displayResult(finalScore);

                await submitAttempt(
                    finalResult,
                    name,
                    mode
                );
            }
        });


        /*
         * Existing TypingEngine input handler.
         */
        textarea.oninput = () => {
            engine.handleInput(textarea.value);
        };


        textarea.focus();
    };


    /*
     * ------------------------------------------------------------
     * EARLY SUBMIT
     * ------------------------------------------------------------
     */

    $('btn-submit-early').onclick = () => {

        if (
            engine &&
            confirm('End this test now?')
        ) {
            engine.stop();
        }
    };


    /*
     * ------------------------------------------------------------
     * RESULT COMPARISON
     * ------------------------------------------------------------
     */

    function renderComparison(score) {

        $('result-original-content').textContent =
            currentPassage.passage;

        const c =
            $('result-typed-content');

        c.innerHTML = '';

        score.alignment.forEach((x, i) => {

            if (i) {
                c.appendChild(
                    document.createTextNode(' ')
                );
            }

            const s =
                document.createElement('span');

            s.className =
                x.type === 'match'
                    ? 'result-token'
                    : x.type === 'substitute'
                        ? 'result-token-wrong'
                        : x.type === 'delete'
                            ? 'result-token-missing'
                            : 'result-token-extra';


            s.textContent =
                x.type === 'match'
                    ? x.typed
                    : x.type === 'substitute'
                        ? `${x.typed} [${x.expected}]`
                        : x.type === 'delete'
                            ? `[${x.expected} — skipped]`
                            : `${x.typed} [extra]`;


            c.appendChild(s);
        });


        /*
         * Keep double-space information for display,
         * but it is NOT automatically added to totalErrors
         * by the new scorer.
         */

        if (score.doubleSpaceErrors) {

            const n =
                document.createElement('div');

            n.className =
                'result-legend';

            n.textContent =
                `Double-space runs detected: ${score.doubleSpaceErrors}`;

            c.appendChild(n);
        }
    }


    /*
     * ------------------------------------------------------------
     * DISPLAY FINAL RESULT
     * ------------------------------------------------------------
     */

    function displayResult(s) {

        $('res-net-wpm').textContent =
            s.netWpm;

        $('res-gross-wpm').textContent =
            s.grossWpm;

        $('res-accuracy').textContent =
            `${s.accuracy}%`;

        $('res-total-errors').textContent =
            s.totalErrors;

        $('res-penalty').textContent =
            s.penaltyWords;

        /*
         * This is retained for compatibility.
         *
         * NOTE:
         * It is now the tokenizer word count, while
         * grossWords is the BSF 5-key-depression word count.
         */

        $('res-typed-words').textContent =
            s.totalTypedWords;

        $('res-free-errors').textContent =
            s.freeErrors;

        $('res-excess-errors').textContent =
            s.excessErrors;

        $('res-elapsed').textContent =
            s.elapsedMinutes.toFixed(2);


        /*
         * Optional new UI fields.
         *
         * If these IDs exist in HTML, they will be populated.
         * Otherwise nothing happens.
         */

        const grossWordsEl =
            $('res-gross-words');

        if (grossWordsEl) {
            grossWordsEl.textContent =
                Number(s.grossWords).toFixed(2);
        }


        const keyDepressionsEl =
            $('res-key-depressions');

        if (keyDepressionsEl) {
            keyDepressionsEl.textContent =
                s.keyDepressions;
        }


        const kdpHEl =
            $('res-kdph');

        if (kdpHEl) {

            kdpHEl.textContent =
                Math.round(
                    s.keyDepressions /
                    s.elapsedMinutes
                );
        }


        const p =
            ScoringEngine.getPerformanceLabel(s);

        const b =
            $('result-status-badge');

        b.textContent = p.text;

        b.className =
            `score-status ${p.class}`;


        renderComparison(s);
    }


    /*
     * ------------------------------------------------------------
     * SAVE ATTEMPT
     * ------------------------------------------------------------
     */

    async function submitAttempt(
        res,
        name,
        mode
    ) {

        const s = res.score;


        /*
         * Existing DB fields retained.
         *
         * New KDPH / BSF fields are added below.
         */

        const payload = {

            user_id: user.id,

            candidate_name: name,

            candidate_id: user.id,

            test_id: currentPassage.id,

            language: currentPassage.language,

            mode,

            duration_seconds:
                Math.round(
                    res.elapsedSeconds ||
                    s.elapsedMinutes * 60
                ),


            /*
             * Existing values
             */
            typed_words:
                s.totalTypedWords,

            typed_characters:
                s.totalTypedChars,

            correct_characters:
                s.correctChars,

            incorrect_characters:
                s.incorrectChars,

            total_errors:
                s.totalErrors,

            free_errors:
                s.freeErrors,

            excess_errors:
                s.excessErrors,

            penalty_words:
                s.penaltyWords,

            gross_wpm:
                s.grossWpm,

            net_wpm:
                s.netWpm,

            accuracy:
                s.accuracy,


            suspicious_events:
                res.suspiciousEvents || [],

            typed_content:
                res.typedText || '',


            /*
             * ----------------------------------------------------
             * NEW BSF/KDPH DATA
             * ----------------------------------------------------
             */

            key_depressions:
                s.keyDepressions,

            key_depressions_per_word:
                s.keyDepressionsPerWord,

            gross_words:
                s.grossWords,

            permissible_error_pct:
                s.permissibleErrorPct,

            penalty_per_excess_error:
                s.penaltyPerExcessError,


            /*
             * Complete score snapshot
             */
            result_snapshot: {
                score: s
            }
        };


        const {
            error
        } = await supabaseClient
            .from('attempts')
            .insert(payload);


        if (error) {
            console.error(
                'Attempt save failed',
                error
            );
        }
    }

});
