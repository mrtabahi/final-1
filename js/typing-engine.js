/**
 * Decoding HCM - Professional Typing Engine
 *
 * Responsibilities:
 * - Test timer
 * - Automatic test start
 * - Automatic test completion
 * - Typed text tracking
 * - Effective keystroke tracking
 * - Backspace/Delete disabled
 * - Paste/Cut disabled
 * - Editing shortcuts disabled
 * - Focus/visibility monitoring
 * - Sends keystroke count to ScoringEngine
 *
 * IMPORTANT:
 * The ScoringEngine is responsible for:
 * - Error calculation
 * - 5% permissible errors
 * - 10-word penalty
 * - 5 keystrokes = 1 equivalent word
 * - Gross WPM / Net WPM
 */

class TypingEngine {

    constructor(config = {}) {

        // ---------------------------------------------------------
        // TEST CONFIGURATION
        // ---------------------------------------------------------

        this.passageText = String(
            config.passageText ?? ""
        );

        this.durationSeconds = Math.max(
            1,
            Number(config.durationSeconds ?? 600)
        );

        this.scoringConfig =
            config.scoringConfig || {};

        this.mode =
            config.mode || "screen";

        // ---------------------------------------------------------
        // CALLBACKS
        // ---------------------------------------------------------

        this.onTick =
            typeof config.onTick === "function"
                ? config.onTick
                : function () {};

        this.onComplete =
            typeof config.onComplete === "function"
                ? config.onComplete
                : function () {};

        this.onAntiCheatTrigger =
            typeof config.onAntiCheatTrigger === "function"
                ? config.onAntiCheatTrigger
                : function () {};

        // ---------------------------------------------------------
        // TYPING STATE
        // ---------------------------------------------------------

        this.typedText = "";

        /*
         * Effective keystrokes.
         *
         * This is intentionally kept separately from
         * typedText.length.
         *
         * ScoringEngine can use this value for:
         *
         * 5 key depressions = 1 equivalent word
         */
        this.totalKeystrokes = 0;

        this.isActive = false;
        this.isFinished = false;

        // ---------------------------------------------------------
        // TIMER STATE
        // ---------------------------------------------------------

        this.startTimestamp = null;
        this.lastTickRemaining =
            this.durationSeconds;

        this.timerId = null;

        // ---------------------------------------------------------
        // ANTI-CHEAT STATE
        // ---------------------------------------------------------

        this.suspiciousEvents = [];

        this.visibilityHandler = null;
        this.inputElement = null;

        // ---------------------------------------------------------
        // INTERNAL BINDINGS
        // ---------------------------------------------------------

        this.boundKeydownHandler =
            this.handleKeyDown.bind(this);

        this.boundInputHandler =
            this.handleElementInput.bind(this);

        this.boundPasteHandler =
            this.preventEditingAction.bind(this);

        this.boundCutHandler =
            this.preventEditingAction.bind(this);

        this.boundDropHandler =
            this.preventEditingAction.bind(this);

        this.boundContextMenuHandler =
            this.preventContextMenu.bind(this);
    }


    // ============================================================
    // START TEST
    // ============================================================

    start() {

        if (this.isActive || this.isFinished) {
            return;
        }

        this.isActive = true;

        this.startTimestamp =
            performance.now();

        this.lastTickRemaining =
            this.durationSeconds;

        this.bindAntiCheat();

        this.tick();

        this.timerId =
            setInterval(
                () => this.tick(),
                250
            );
    }


    // ============================================================
    // TIMER
    // ============================================================

    tick() {

        if (!this.isActive) {
            return;
        }

        const elapsed =
            (
                performance.now() -
                this.startTimestamp
            ) / 1000;

        const remaining =
            Math.max(
                0,
                this.durationSeconds -
                elapsed
            );

        const wholeRemaining =
            Math.ceil(remaining);

        this.lastTickRemaining =
            wholeRemaining;

        this.onTick(
            wholeRemaining,
            elapsed
        );

        if (remaining <= 0) {
            this.stop("time");
        }
    }


    // ============================================================
    // ATTACH TYPING INPUT
    // ============================================================

    /**
     * Connect the TypingEngine to textarea/input/contenteditable.
     *
     * Example:
     *
     * typingEngine.attachInputElement(textarea);
     */

    attachInputElement(element) {

        if (!element) {
            return;
        }

        // Remove previous element bindings first.
        this.detachInputElement();

        this.inputElement = element;

        // Keyboard control
        element.addEventListener(
            "keydown",
            this.boundKeydownHandler,
            true
        );

        // Actual text changes
        element.addEventListener(
            "input",
            this.boundInputHandler,
            true
        );

        // Prevent paste
        element.addEventListener(
            "paste",
            this.boundPasteHandler,
            true
        );

        // Prevent cut
        element.addEventListener(
            "cut",
            this.boundCutHandler,
            true
        );

        // Prevent drag/drop text insertion
        element.addEventListener(
            "drop",
            this.boundDropHandler,
            true
        );

        // Prevent right-click editing menu
        element.addEventListener(
            "contextmenu",
            this.boundContextMenuHandler,
            true
        );

        /*
         * Browser-level hints.
         * These don't replace keydown protection,
         * but improve the typing-box behavior.
         */

        try {
            element.setAttribute(
                "autocomplete",
                "off"
            );

            element.setAttribute(
                "autocorrect",
                "off"
            );

            element.setAttribute(
                "autocapitalize",
                "off"
            );

            element.setAttribute(
                "spellcheck",
                "false"
            );

        } catch (error) {
            // Ignore unsupported attributes.
        }
    }


    // ============================================================
    // DETACH INPUT
    // ============================================================

    detachInputElement() {

        if (!this.inputElement) {
            return;
        }

        const element =
            this.inputElement;

        element.removeEventListener(
            "keydown",
            this.boundKeydownHandler,
            true
        );

        element.removeEventListener(
            "input",
            this.boundInputHandler,
            true
        );

        element.removeEventListener(
            "paste",
            this.boundPasteHandler,
            true
        );

        element.removeEventListener(
            "cut",
            this.boundCutHandler,
            true
        );

        element.removeEventListener(
            "drop",
            this.boundDropHandler,
            true
        );

        element.removeEventListener(
            "contextmenu",
            this.boundContextMenuHandler,
            true
        );

        this.inputElement = null;
    }


    // ============================================================
    // KEYBOARD CONTROL
    // ============================================================

    handleKeyDown(event) {

        if (this.isFinished) {
            event.preventDefault();
            return;
        }

        const key =
            String(event.key || "");

        const lowerKey =
            key.toLowerCase();

        // ---------------------------------------------------------
        // BACKSPACE - COMPLETELY DISABLED
        // ---------------------------------------------------------

        if (key === "Backspace") {

            event.preventDefault();
            event.stopPropagation();

            return;
        }

        // ---------------------------------------------------------
        // DELETE - DISABLED
        // ---------------------------------------------------------

        if (key === "Delete") {

            event.preventDefault();
            event.stopPropagation();

            return;
        }

        // ---------------------------------------------------------
        // PASTE / CUT / COPY-BASED EDITING SHORTCUTS
        // ---------------------------------------------------------

        if (
            event.ctrlKey ||
            event.metaKey
        ) {

            const blockedShortcuts = [
                "v", // paste
                "x", // cut
                "a", // select all
                "z", // undo
                "y", // redo
                "insert"
            ];

            if (
                blockedShortcuts.includes(
                    lowerKey
                )
            ) {

                event.preventDefault();
                event.stopPropagation();

                return;
            }
        }

        // ---------------------------------------------------------
        // INSERT KEY
        // ---------------------------------------------------------

        if (key === "Insert") {

            event.preventDefault();
            event.stopPropagation();

            return;
        }

        /*
         * Navigation keys are disabled so candidate cannot
         * move the cursor backward and edit previous text.
         */

        const navigationKeys = [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
            "PageUp",
            "PageDown"
        ];

        if (
            navigationKeys.includes(key)
        ) {

            event.preventDefault();
            event.stopPropagation();

            return;
        }

        /*
         * Do not count modifier-only keys as keystrokes.
         */

        const modifierOnlyKeys = [
            "Shift",
            "Control",
            "Alt",
            "Meta",
            "CapsLock",
            "Tab",
            "Escape"
        ];

        if (
            modifierOnlyKeys.includes(key)
        ) {
            return;
        }

        /*
         * The test starts when a character-producing key
         * is pressed.
         *
         * Space is included.
         */

        if (
            key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
        ) {

            if (!this.isActive) {
                this.start();
            }
        }
    }


    // ============================================================
    // INPUT EVENT
    // ============================================================

    handleElementInput(event) {

        if (this.isFinished) {
            return;
        }

        const element =
            event.currentTarget ||
            this.inputElement;

        if (!element) {
            return;
        }

        let value = "";

        /*
         * Normal textarea/input
         */

        if (
            typeof element.value ===
            "string"
        ) {

            value = element.value;

        /*
         * contenteditable
         */

        } else if (
            element.isContentEditable
        ) {

            value =
                element.textContent || "";
        }

        this.handleInput(value);
    }


    // ============================================================
    // TEXT INPUT
    // ============================================================

    handleInput(text) {

        if (this.isFinished) {
            return;
        }

        const newText =
            String(text ?? "");

        /*
         * If text suddenly becomes shorter,
         * some deletion operation has happened.
         *
         * Backspace/Delete are supposed to be disabled.
         *
         * Restore previous text if that happens.
         */

        if (
            newText.length <
            this.typedText.length
        ) {

            if (this.inputElement) {

                try {

                    if (
                        typeof this.inputElement.value ===
                        "string"
                    ) {

                        this.inputElement.value =
                            this.typedText;

                    } else if (
                        this.inputElement.isContentEditable
                    ) {

                        this.inputElement.textContent =
                            this.typedText;
                    }

                } catch (error) {
                    // Ignore DOM restoration errors.
                }

            }

            return;
        }

        /*
         * First actual text entry starts the test.
         */

        if (
            !this.isActive &&
            newText.length > 0
        ) {

            this.start();
        }

        /*
         * Update typed text.
         */

        this.typedText =
            newText;
    }


    // ============================================================
    // BLOCK PASTE / CUT / DROP
    // ============================================================

    preventEditingAction(event) {

        event.preventDefault();
        event.stopPropagation();
    }


    // ============================================================
    // BLOCK CONTEXT MENU
    // ============================================================

    preventContextMenu(event) {

        event.preventDefault();
    }


    // ============================================================
    // MANUAL INPUT API
    // ============================================================

    /**
     * Useful if the existing website already has its own
     * input listener.
     *
     * Example:
     * typingEngine.handleInput(textarea.value);
     */
    updateTypedText(text) {

        this.handleInput(text);
    }


    // ============================================================
    // STOP TEST
    // ============================================================

    stop(reason = "manual") {

        if (this.isFinished) {
            return;
        }

        if (this.timerId) {

            clearInterval(
                this.timerId
            );

            this.timerId = null;
        }

        this.isActive = false;
        this.isFinished = true;

        this.unbindAntiCheat();

        const elapsedSeconds =
            this.startTimestamp

                ? Math.min(
                    this.durationSeconds,
                    Math.max(
                        0.001,
                        (
                            performance.now() -
                            this.startTimestamp
                        ) / 1000
                    )
                )

                : 0.001;


        /*
         * ---------------------------------------------------------
         * SEND KEYSTROKES TO SCORING ENGINE
         * ---------------------------------------------------------
         *
         * ScoringEngine should use:
         *
         * totalKeystrokes / 5
         *
         * for BSF-style equivalent words.
         */

        const score =
            ScoringEngine.calculateScore(
                this.passageText,
                this.typedText,
                elapsedSeconds,
                this.scoringConfig,
                this.totalKeystrokes
            );


        this.onComplete({
            score,
            typedText:
                this.typedText,

            elapsedSeconds,

            totalKeystrokes:
                this.totalKeystrokes,

            reason,

            suspiciousEvents:
                this.suspiciousEvents
        });
    }


    // ============================================================
    // ANTI-CHEAT
    // ============================================================

    bindAntiCheat() {

        if (this.visibilityHandler) {
            return;
        }

        this.visibilityHandler = () => {

            if (
                document.hidden &&
                this.isActive
            ) {

                const log =
                    `Tab switched/minimized at ${new Date().toISOString()}`;

                this.suspiciousEvents.push(
                    log
                );

                this.onAntiCheatTrigger(
                    "Tab/window focus interruption recorded."
                );
            }
        };

        document.addEventListener(
            "visibilitychange",
            this.visibilityHandler
        );
    }


    // ============================================================
    // REMOVE ANTI-CHEAT LISTENER
    // ============================================================

    unbindAntiCheat() {

        if (
            this.visibilityHandler
        ) {

            document.removeEventListener(
                "visibilitychange",
                this.visibilityHandler
            );
        }

        this.visibilityHandler = null;
    }


    // ============================================================
    // DESTROY ENGINE
    // ============================================================

    destroy() {

        if (this.timerId) {

            clearInterval(
                this.timerId
            );

            this.timerId = null;
        }

        this.unbindAntiCheat();
        this.detachInputElement();

        this.isActive = false;
        this.isFinished = true;
    }
}
