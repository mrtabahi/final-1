# Development handoff and pending-work register

Last updated: 2026-10-31 (latest update: Fix Accuracy toolbar icon/state repair)
Repository: [mrtabahi/final-1](https://github.com/mrtabahi/final-1)
Working branch: `fix/custom-domain-seo`
Pull request: [#96](https://github.com/mrtabahi/final-1/pull/96) — open; do not merge without explicit user approval.
Production branch: `main` — unchanged by this work.

## Current objective
Improve the typing experience safely by progressively sharing workspace controls and presentation while preserving each activity's distinct input, scoring, timer, result, and submission semantics.

## Completed in this workstream
- Canonical scoring engine remains `supabase/functions/typing-result/typing-master.js`; no formula changed.
- Shared defaults/metadata: `js/typing/master-config.js`, `js/typing/activity-registry.js`.
- Shared responsive presentation: `css/master-typing-interface.css`.
- Added `js/typing/workspace-controls.js` with reusable bounded font sizing, element visibility, display, and class-state helpers.
- Self Test uses shared font and visibility/highlight helpers for passage and typing panels.
- Fix Accuracy uses shared font and passage display/highlight helpers; retains its existing font range/step and reinitializes at 19.2px per new attempt.
- Added tests for shared config, admin site-experience controls, and shared font controls.
- Admin Website Settings missing site-experience UI controls restored in `js/admin.js`; existing `site_experience_settings` persistence is reused.
- No database migration, production schema change, scoring formula change, or production deploy was performed.

## Important behavior boundaries
- Exam/test duration, target speeds, and scoring remain server-authoritative.
- Self Test retains BSF/CRPF selection; Fix Accuracy retains committed-word BSF semantics.
- Do not expose `freeErrorPct` as an admin control: current canonical free-error allowance uses `floor(measuredKeystrokes / 100)`; the legacy config value is not applied.
- Do not enable Google OAuth; authentication remains manual email/password.
- Do not merge PR #96 unless the user explicitly authorizes it.

## Deployment and CI status at last check
- Vercel preview for commit `e1c1ac1103ab600d34f6a4817839ebf653a999d9` was READY:
  https://final-1-abti6ynmn-decoding-hcn.vercel.app
- Latest PR head `3ea1d8c08d56f3c03da020d9809ac75b16293784` has a Vercel preview deployment READY: `dpl_UXjcc5HAZgCZdDT8sMRZii5QZkJz` at https://final-1-cwa8rw93t-decoding-hcn.vercel.app. The earlier build-rate-limit blocker is no longer present.
- Previous head `542bf0952ec70b28d7ddb105e28f7b9a2a08c7c1`: GitHub Actions Security regression tests run #317 (`41127628781`) completed SUCCESS. Its Vercel status still reflected the older build-rate-limit failure and had no matching deployment record.
- Latest branch head is `3ea1d8c08d56f3c03da020d9809ac75b16293784` (docs refresh). GitHub Actions Security regression tests run #323 (`41173781614`) completed SUCCESS for this exact head. Its Vercel preview `dpl_UXjcc5HAZgCZdDT8sMRZii5QZkJz` is READY at https://final-1-cwa8rw93t-decoding-hcn.vercel.app.
- Production deployment on `main` was READY at last check; no production release from this branch.

## Other open PRs / security follow-up
- PR #94: revoke anon/public execution on `public.has_active_paid_subscription()`; production ACL already applied, PR open/unmerged.
- PR #95: revoke TRUNCATE from anon/authenticated on public schema tables; production verified zero grants, PR open/unmerged.
- Keep both PRs tracked; do not merge without explicit approval.
- Security advisor follow-ups previously noted: public leaderboard security-definer view; leaked-password protection disabled; unindexed foreign keys; multiple permissive RLS policies; RLS init/performance warnings. Re-audit before making changes. Leaderboard is lower priority; do not risk breaking it.

## Latest typing workspace presentation update
- Added shared `setHidden`, `setDisplay`, and `setClassState` helpers to `js/typing/workspace-controls.js`.
- Integrated them into Self Test and Fix Accuracy without changing timer/scoring/submission logic.
- Added unit tests for hide/show, display restoration, and highlight class toggling in `tests/typing-workspace-controls.test.cjs`.
- Updated both HTML pages to load the refreshed helper asset version.
- CI run #323 for exact latest head `3ea1d8c08d56f3c03da020d9809ac75b16293784` passed.

## Latest typing lifecycle test update
- Added regression cases in `tests/typing-engine-lifecycle-regression.test.cjs` for first printable key (including Space), modifier-only keys, Backspace disabled/enabled behavior, and passage-completion single submission.
- Commit: `f167322f6ecbf8c015714fed767d2b51ab706404`.
- These are automated regression additions; the workflow has not yet reported results for this commit. Do not treat them as passed until CI completes.

## Remaining typing-workspace tasks
1. Extract shared passage/input layout and common keyboard/input helpers only after a behavior-parity test plan exists.
2. Timer lifecycle regression coverage includes single-start, first printable key/Space, modifier keys, Backspace semantics, duration completion, destroy cleanup, and passage-completion single-submit. Shared presentation tests now cover hide/show, display restoration, and highlight class toggling. Still add cancel/restart integration coverage.
3. Audit the main exam typing page against Self Test and Fix Accuracy; keep exam-specific server config and result submission untouched.
4. Verify font controller behavior in browser at desktop/mobile sizes, including reset/restart.
5. Review test scripts and run the complete relevant test suite once CI is available.
6. Keep accessibility/reduced-motion and mobile layout checks in release validation.

## Remaining Admin Settings tasks
1. Validate restored controls against existing handlers and storage policies.
2. Review site-experience settings RLS and storage bucket policy in staging; do not change production without approval.
3. Add server-side allowlist/schema validation and audit logging before introducing any new persisted typing settings.
4. Add safe runtime settings only where they truly affect the client; no exam-authoritative overrides.
5. Add restore-defaults/versioning only after existing persistence flow is fully tested.

## Release checklist (must remain open until verified)
- [x] Vercel preview for exact latest PR head `3ea1d8c08d56f3c03da020d9809ac75b16293784` reaches READY.
- [x] GitHub Actions Security regression tests pass for exact latest PR head (run #323, `41173781614`).
- [ ] Browser smoke tests on preview: canonical URLs, sitemap, robots.txt, manual signup/login, password reset, payment return flow.
- [ ] Admin Website Settings: load, edit, save, reload, audio upload/type/size validation.
- [ ] Typing smoke tests: exam, Self Test, Fix Accuracy; score parity and edge cases.
- [ ] Mobile and desktop layout/accessibility review.
- [ ] Staging DB/RLS/storage validation before any migration.
- [ ] Explicit user approval before merging PR #96 or deploying production.

## Resume instructions
When work resumes, re-fetch PR #96's head SHA, Actions checks, and Vercel deployments before relying on these statuses. Continue cancel/restart integration coverage, then audit Main Typing Test parity. Do not merge PR #96 or deploy production without explicit approval.


## Verification refresh — 2026-10-31
- Exact latest PR head `3ea1d8c08d56f3c03da020d9809ac75b16293784`: Security regression tests run #323 (`41173781614`) completed SUCCESS.
- Exact latest PR head Vercel preview: READY, deployment `dpl_UXjcc5HAZgCZdDT8sMRZii5QZkJz`, https://final-1-cwa8rw93t-decoding-hcn.vercel.app.
- Previously building page-specific previews are now READY: Self Test commit `6d7699e86c2d673cf9874e2b06852875078e8cd0`; Fix Accuracy commit `87f5f6e95c72790ff7d5c74c218393dc755755a5`.
- PR #96 remains open/unmerged; production `main` remains untouched. No production deployment or database mutation was performed.


## Fix Accuracy toolbar repair — 2026-10-31
- Fixed the compact toolbar controls on Fix Accuracy: buttons now provide their required `data-icon` and tooltip attributes so icons render through the shared compact-control CSS.
- Highlight and Hide Passage toggles now update `aria-pressed`, accessible button text, and the correct on/off icon. Existing shared CSS renders pressed controls green and unpressed controls neutral.
- Font decrease/increase buttons now expose A− / A+ icons and descriptive tooltips; these are actions, not on/off toggles, so they do not use pressed state.
- Added a regression test covering the four controls' icon/tooltip markup and the toggle-state synchronization code.
- Cache-busted the Fix Accuracy script to `js/fix-accuracy.js?v=20261031-toolbar1`.
- Commits: `29a929f1e0edc5ca6ebcc632355bb1b998acd814`, `5fdb0d66f23e3d8d07495fdbe6558e1d695e2ab8`, `0978048825f12a22d925de1dc8cc66dae52706a6`, `f57c11ce074165a50163128360e3dcf77d8279d2`.
- Exact latest code head `f57c11ce074165a50163128360e3dcf77d8279d2`: Security regression tests run #327 (`41174649038`) SUCCESS; Vercel preview READY: https://final-1-6vhjg8ne7-decoding-hcn.vercel.app.
- Preview deployment is ready, but a manual browser interaction check is still required before calling the visual bug fully verified.

## Next implementation focus
1. Add cancel/restart lifecycle integration regression tests for Self Test and Fix Accuracy, ensuring timers are cleared and new attempts reset state without cross-attempt leakage.
2. Audit Typing Test menu activities and the main exam typing workspace against the shared Master Interface. The shared interface should be the default for all test/practice activities unless an explicit Admin setting selects an alternate interface.
3. Inspect the existing Admin interface selector/settings and runtime registry before changing behavior; do not introduce a parallel setting or let a global default override exam-authoritative duration/scoring/targets.
4. Keep PR #96 open until browser smoke tests and parity checks are complete; no production merge/deploy without explicit user approval.


## Follow-up audit — 2026-10-31
- Rechecked exact documentation head `f11500b6f2372b078aa5f5a5ea0faa0f06f2d232`: GitHub Actions Security regression tests run #328 (`41174691775`) completed SUCCESS.
- Vercel preview remains READY at https://final-1-6vhjg8ne7-decoding-hcn.vercel.app; deployment metadata points to code commit `f57c11ce074165a50163128360e3dcf77d8279d2` (the later handoff-only docs commit does not have a distinct preview deployment).
- `js/interface-switcher.js` is loaded by `start_test.html` and `self-test.html`, but not by `fix-accuracy.html`. It currently injects a separate legacy Screen-to-Screen / PDF-to-Screen presentation mode; it is not the shared Master Interface and should not be made global without separating its layout behavior from activity controls.
- All three workspace pages load `css/master-typing-interface.css`; `js/typing/master-config.js` currently defines scoring/UI/practice defaults but no interface-selection policy.
- Admin Website Settings already reads/writes singleton `site_experience_settings` for landing page and audio. The existing migration has no interface field, and no interface override control/runtime resolver was found. Reuse this table if implementing a persisted interface preference; do not create a duplicate settings table.
- Self Test cancel explicitly clears its interval and resets attempt state; its result-screen “Again” action returns to setup and the next start initializes a fresh attempt. Fix Accuracy restart clears its interval and returns to setup; the next setup submission resets attempt state. Add runtime-level tests for these flows rather than relying only on markup assertions.
- Production `main` remains unchanged; PR #96 remains open and unmerged.


## Continued implementation — 2026-10-31
- Fix Accuracy lifecycle: replaced restart/again handlers with shared `returnToSetup()`. It clears the active interval and nulls its handle, resets elapsed/finished/error/backspace/passage state, clears and re-enables the input, resets visible live metrics, and returns to setup without calling `finish()` or submitting a score. Commit: `346425a6c099f0006ccb4c6557ad73d5a2170f18`.
- Added lifecycle regression coverage for Fix Accuracy restart/again and Self Test cancel/again. Commit: `09e3da1bf8db8eb206256003bdcd8624b68cc25c`. The tests currently assert the lifecycle wiring/source invariants; browser-level integration still remains desirable.
- Added migration `20261031130000_typing_interface_preferences.sql` adding JSONB `typing_interface_preferences` to the existing `site_experience_settings` singleton. It constrains the global default to Master and allows per-activity values master/screen/pdf. Migration is committed but has NOT been applied to staging or production.
- Admin Website Settings now renders independent interface selectors for Main Typing Test, Self Test and Fix Accuracy and saves them into the existing singleton JSONB field. Commit: `635f30a30c71a09c39c4360a8f6179ccef53c1dd`. Added admin test for the selectors and save payload in commit `07ba6267418b34354ffee988c8d1f9860264a020`.
- Important remaining work: runtime resolver/application is NOT yet implemented. Do not claim Master Interface is already active site-wide. Before rollout, implement a shared preference loader used by all three workspaces (including Fix Accuracy), default missing/invalid values to Master, apply only the selected activity override, and leave all activity lifecycle/scoring/submission code untouched. Ensure alternate screen/pdf layouts are compatible with Fix Accuracy before enabling those options there. Apply migration to staging only after tests and explicit review; production remains untouched.
- Current branch head after these changes: `07ba6267418b34354ffee988c8d1f9860264a020`.


## 2026-10-31 follow-up: highlight opt-out and scroll reliability
- PR #96 remains open/unmerged; production branch `main` is unchanged.
- Added hard CSS opt-out rules so generated character-level classes cannot retain colors/backgrounds/underlines when Highlight is OFF in Main Typing Test, Self Test, and Fix Accuracy.
- Added Fix Accuracy active-character viewport tracking after each input render; scrolls only when the active character approaches the visible passage boundary.
- Added `tests/typing-highlight-autoscroll-regression.test.cjs` to guard the three-page highlight opt-out and Fix Accuracy scroll hook.
- These are code-level changes and regression assertions; a real-browser visual/long-passage test has not yet been performed. Do not describe auto-scroll as 100% verified until desktop/mobile browser checks pass.
- Still pending from the current request: shared Full Screen and Typing Mode controls on Self Test/Fix Accuracy; parity review and enhancements for Fix Accuracy result analysis/original-vs-typed passage comparison; browser validation of all three auto-scroll paths; shared runtime Admin interface preference resolver. Do not change scoring/timer/anti-cheat semantics.

## 2026-10-31 follow-up: activity controls
- Highlight OFF hard-neutralization CSS is now present in Main Typing Test, Self Test, and Fix Accuracy; Fix Accuracy now tracks the active character and scrolls only when it nears the passage viewport edge.
- Added Full Screen and pre-typing On-screen/Off-screen mode controls to Self Test and Fix Accuracy. Both mode controls lock after typing begins; each activity keeps its own timer/scoring lifecycle. Main Typing Test already has these controls.
- Added regression test `tests/typing-highlight-autoscroll-regression.test.cjs`.
- GitHub Actions Security regression tests passed for commits `9ec0d79`, `566d2c1`, `65167fa`, `d60a5b7`, and other preceding commits. Cache-version-only follow-up commits `1d0c902` and `124da89` still need exact-head CI confirmation.
- Browser verification (desktop/mobile, long passage, Full Screen exit, and screen/off-screen behavior) remains pending. Fix Accuracy result report still needs original-passage comparison panel and visual parity audit against the Main Typing Test reference.
- PR #96 stays open/unmerged; no production deployment or production DB migration.
