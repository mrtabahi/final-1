/* DEPRECATED COMPATIBILITY SHIM.
 * All canonical typing calculations live in js/typing-master.js.
 * Load that master file before any script that expects ScoringEngine.
 */
(function (global) {
  if (global && global.TypingMaster) {
    global.ScoringEngine = global.TypingMaster;
    return;
  }
  if (typeof console !== "undefined") {
    console.error("Typing scoring master is not loaded. Include js/typing-master.js instead of js/scoring.js.");
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
