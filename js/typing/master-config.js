/* Shared defaults and activity registry for the typing experience.
 * Scoring formulas remain exclusively in supabase/functions/typing-result/typing-master.js.
 * Keep exam-specific targets/duration supplied by the server-side test record.
 */
(function (root) {
  'use strict';

  const defaults = Object.freeze({
    scoring: Object.freeze({
      defaultFormula: 'bsf',
      penaltyPerError: 10,
      // Legacy compatibility only: the canonical scorer currently uses
      // floor(measuredKeystrokes / 100); this value does not alter that rule.
      freeErrorPct: 0.05
    }),
    ui: Object.freeze({
      passageFontSize: 18,
      highlightEnabled: true,
      backspaceEnabled: true
    }),
    practice: Object.freeze({
      selfTestDurationSeconds: 300,
      fixAccuracyDurationSeconds: 0,
      fixAccuracyMaxErrors: 5
    })
  });

  const activities = Object.freeze({
    exam: Object.freeze({ id: 'exam', scoring: 'server-authoritative', formula: 'server-selected' }),
    selfTest: Object.freeze({ id: 'self-test', scoring: 'master', formula: 'bsf' }),
    fixAccuracy: Object.freeze({ id: 'fix-accuracy', scoring: 'master-committed', formula: 'bsf' })
  });

  function getScoringConfig(overrides) {
    return Object.assign({}, defaults.scoring, overrides || {});
  }

  function getActivity(id) {
    return activities[id] || null;
  }

  root.TypingExperienceConfig = Object.freeze({
    defaults,
    activities,
    getScoringConfig,
    getActivity
  });
})(typeof window !== 'undefined' ? window : globalThis);
