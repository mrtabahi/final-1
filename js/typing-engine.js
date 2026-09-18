/** Accurate browser typing timer with focus/visibility monitoring. */
class TypingEngine {
    constructor(config) {
        this.passageText = config.passageText || "";
        this.durationSeconds = Number(config.durationSeconds || 600);
        this.scoringConfig = config.scoringConfig || {};
        this.mode = config.mode || "screen";
        this.onTick = config.onTick || function () {};
        this.onComplete = config.onComplete || function () {};
        this.onAntiCheatTrigger = config.onAntiCheatTrigger || function () {};
        this.typedText = "";
        this.isActive = false;
        this.isFinished = false;
        this.startTimestamp = null;
        this.lastTickRemaining = this.durationSeconds;
        this.timerId = null;
        this.suspiciousEvents = [];
        this.visibilityHandler = null;
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
        if (remaining <= 0) this.stop();
    }

    handleInput(text) {
        if (!this.isActive && !this.isFinished && String(text).length > 0) this.start();
        if (this.isFinished) return;
        this.typedText = String(text ?? "");
    }

    stop() {
        if (this.isFinished) return;
        if (this.timerId) clearInterval(this.timerId);
        this.isActive = false;
        this.isFinished = true;
        this.unbindAntiCheat();
        const elapsedSeconds = this.startTimestamp
            ? Math.min(this.durationSeconds, Math.max(0.001, (performance.now() - this.startTimestamp) / 1000))
            : 0.001;
        const score = ScoringEngine.calculateScore(this.passageText, this.typedText, elapsedSeconds, this.scoringConfig);
        this.onComplete({ score, typedText: this.typedText, elapsedSeconds, suspiciousEvents: this.suspiciousEvents });
    }

    bindAntiCheat() {
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
        if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
        this.visibilityHandler = null;
    }
}
