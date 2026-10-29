/* DEPRECATED COMPATIBILITY SHIM.
 * The single canonical scoring engine lives at
 * supabase/functions/typing-result/typing-master.js and is loaded directly by
 * all test pages and by the Supabase Edge Function.
 */
(function (global) {
  if (global && global.TypingMaster) {
    global.ScoringEngine = global.TypingMaster;
    return;
  }
  if (typeof console !== "undefined") {
    console.error("Typing master is not loaded. Load supabase/functions/typing-result/typing-master.js.");
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
