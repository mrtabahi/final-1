/**
 * Decoding HCM - Professional Typing Engine (Optimized & Bug-Free)
 */

class TypingEngine {

    constructor(config = {}) {
        this.passageText = String(config.passageText ?? "");
        this.durationSeconds = Math.max(1, Number(config.durationSeconds ?? 600));
        this.scoringConfig = config.scoringConfig || {};
        this.mode = config.mode || "screen";

        this.onTick = typeof config.onTick === "function" ? config.onTick : function () {};
        this.onComplete = typeof config.onComplete === "function" ? config.onComplete : function () {};
        this.onAntiCheatTrigger = typeof config.onAntiCheatTrigger === "function" ? config.onAntiCheatTrigger : function () {};

        this.typedText = "";
        this.totalKeystrokes = 0; // Tracks actual key depressions accurately
        this.isActive = false;
        this.isFinished = false;

        this.startTimestamp = null;
        this.lastTickRemaining = this.durationSeconds;
        this.timerId = null;
        this.suspiciousEvents = [];
        this.visibilityHandler = null;
        this.inputElement = null;

        this.boundKeydownHandler = this.handleKeyDown.bind(this);
        this.boundInputHandler = this.handleElementInput.bind(this);
        this.boundPasteHandler = this.preventEditingAction.bind(this);
        this.boundCutHandler = this.preventEditingAction.bind(this);
        this.boundDropHandler = this.preventEditingAction.bind(this);
        this.boundContextMenuHandler = this.preventContextMenu.bind(this);
    }

    start() {
        if (this.isActive || this.isFinished) return;

        this.isActive = true;
        this.startTimestamp = performance.now();
        this.lastTickRemaining = this.durationSeconds;

        this.bindAntiCheat();
        this.tick();

        this.timerId = setInterval(() => this.tick(), 250);
    }

    tick() {
        if (!this.isActive) return;

        const elapsed = (performance.now() - this.startTimestamp) / 1000;
        const remaining = Math.max(0, this.durationSeconds - elapsed);
        const wholeRemaining = Math.ceil(remaining);

        this.lastTickRemaining = wholeRemaining;
        this.onTick(wholeRemaining, elapsed);

        if (remaining <= 0) {
            this.stop("time");
        }
    }

    attachInputElement(element) {
        if (!element) return;

        this.detachInputElement();
        this.inputElement = element;

        element.addEventListener("keydown", this.boundKeydownHandler, true);
        element.addEventListener("input", this.boundInputHandler, true);
        element.addEventListener("paste", this.boundPasteHandler, true);
        element.addEventListener("cut", this.boundCutHandler, true);
        element.addEventListener("drop", this.boundDropHandler, true);
        element.addEventListener("contextmenu", this.boundContextMenuHandler, true);

        try {
            element.setAttribute("autocomplete", "off");
            element.setAttribute("autocorrect", "off");
            element.setAttribute("autocapitalize", "off");
            element.setAttribute("spellcheck", "false");
        } catch (error) {}
    }

    detachInputElement() {
        if (!this.inputElement) return;

        const element = this.inputElement;
        element.removeEventListener("keydown", this.boundKeydownHandler, true);
        element.removeEventListener("input", this.boundInputHandler, true);
        element.removeEventListener("paste", this.boundPasteHandler, true);
        element.removeEventListener("cut", this.boundCutHandler, true);
        element.removeEventListener("drop", this.boundDropHandler, true);
        element.removeEventListener("contextmenu", this.boundContextMenuHandler, true);

        this.inputElement = null;
    }

    handleKeyDown(event) {
        if (this.isFinished) {
            event.preventDefault();
            return;
        }

        const key = String(event.key || "");
        const lowerKey = key.toLowerCase();

        // Standard Blocked Keys for Examinations
        if (key === "Backspace" || key === "Delete" || key === "Insert") {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            const blockedShortcuts = ["v", "x", "a", "z", "y", "insert"];
            if (blockedShortcuts.includes(lowerKey)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }

        const navigationKeys = [
            "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
            "Home", "End", "PageUp", "PageDown"
        ];

        if (navigationKeys.includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // Exclude system modifier keys from actual typing stroke count
        const modifierOnlyKeys = [
            "Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape"
        ];

        if (modifierOnlyKeys.includes(key)) {
            return;
        }

        // FIXED: Safely captures every character keydepression including spaces
        if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            this.totalKeystrokes++;
            if (!this.isActive) {
                this.start();
            }
        }
    }

    handleElementInput(event) {
        if (this.isFinished) return;

        const element = event.currentTarget || this.inputElement;
        if (!element) return;

        let value = "";
        if (typeof element.value === "string") {
            value = element.value;
        } else if (element.isContentEditable) {
            value = element.textContent || "";
        }

        this.handleInput(value);
    }

    handleInput(text) {
        if (this.isFinished) return;

        const newText = String(text ?? "");

        // Anti-deletion logic check
        if (newText.length < this.typedText.length) {
            if (this.inputElement) {
                try {
                    if (typeof this.inputElement.value === "string") {
                        this.inputElement.value = this.typedText;
                    } else if (this.inputElement.isContentEditable) {
                        this.inputElement.textContent = this.typedText;
                    }
                } catch (error) {}
            }
            return;
        }

        if (!this.isActive && newText.length > 0) {
            this.start();
        }

        this.typedText = newText;
    }

    preventEditingAction(event) {
        event.preventDefault();
        event.stopPropagation();
    }

    preventContextMenu(event) {
        event.preventDefault();
    }

    updateTypedText(text) {
        this.handleInput(text);
    }

    stop(reason = "manual") {
        if (this.isFinished) return;

        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }

        this.isActive = false;
        this.isFinished = true;

        this.unbindAntiCheat();

        const elapsedSeconds = this.startTimestamp
            ? Math.min(this.durationSeconds, Math.max(0.001, (performance.now() - this.startTimestamp) / 1000))
            : 0.001;

        const score = ScoringEngine.calculateScore(
            this.passageText,
            this.typedText,
            elapsedSeconds,
            this.scoringConfig,
            this.totalKeystrokes
        );

        this.onComplete({
            score,
            typedText: this.typedText,
            elapsedSeconds,
            totalKeystrokes: this.totalKeystrokes,
            reason,
            suspiciousEvents: this.suspiciousEvents
        });
    }

    bindAntiCheat() {
        if (this.visibilityHandler) return;

        this.visibilityHandler = () => {
            if (document.hidden && this.isActive) {
                const log = `Tab switched/minimized at ${new Date().toISOString()}`;
                this.suspiciousEvents.push(log);
                this.onAntiCheatTrigger("Tab/window focus interruption recorded.");
            }
        };

        document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    unbindAntiCheat() {
        if (this.visibilityHandler) {
            document.removeEventListener("visibilitychange", this.visibilityHandler);
        }
        this.visibilityHandler = null;
    }

    destroy() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }

        this.unbindAntiCheat();
        this.detachInputElement();
        this.isActive = false;
        this.isFinished = true;
    }
    }
