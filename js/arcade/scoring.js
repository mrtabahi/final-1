(function (root) {
  'use strict';
  const config = root.TypingExperienceConfig?.getScoringConfig?.() || Object.freeze({ freeErrorPct: 0.05, penaltyPerError: 10 });
  function calculate(expectedWords, committedWords, currentWord, elapsedSeconds, backspacePresses, finalize) {
    if (!root.TypingMaster || typeof root.TypingMaster.calculateCommittedScore !== 'function') {
      throw new Error('The Fix Accuracy scoring engine did not load.');
    }
    const committed = committedWords.join(' ');
    const current = String(currentWord || '');
    const typed = committed + (committedWords.length ? ' ' : '') + current;
    const seconds = Math.max(0.001, Number(elapsedSeconds) || 0.001);
    const bsf = root.TypingMaster.calculateCommittedScore(expectedWords.join(' '), typed, seconds, config, 'bsf', backspacePresses, Boolean(finalize));
    const crpf = root.TypingMaster.calculateCommittedScore(expectedWords.join(' '), typed, seconds, config, 'crpf', backspacePresses, Boolean(finalize));
    return { bsf, crpf, typedText: typed };
  }
  root.ArcadeScoring = Object.freeze({ calculate });
})(window);
