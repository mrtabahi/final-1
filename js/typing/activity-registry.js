/* Stable activity metadata; presentation and activity controllers stay separate. */
(function (root) {
  'use strict';
  const config = root.TypingExperienceConfig;
  if (!config) throw new Error('Load js/typing/master-config.js before the activity registry.');
  root.TypingActivityRegistry = Object.freeze({
    get(id) { return config.getActivity(id); },
    list() { return Object.values(config.activities); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
