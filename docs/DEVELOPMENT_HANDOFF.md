# Development handoff and pending-work register

Last updated: 2026-10-31 (latest update: exact-head CI and Vercel preview verified)
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
