# Development handoff and pending-work register

Last updated: 2026-10-31
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
- Added `js/typing/workspace-controls.js` with a reusable, bounded font-size controller.
- Self Test uses the shared font controller for passage and typing input.
- Fix Accuracy uses the shared font controller for passage and typing input; retains its existing font range/step and reinitializes at 19.2px per new attempt.
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
- Latest tracked Vercel status reported build-rate-limit failure (upgrade/rate-limit target); latest branch commit preview not confirmed. Recheck deployment list and latest commit after the limit clears.
- GitHub Actions Security regression tests for prior head `188018d055c7611075f03c2d73ac462a654d1bdd` were IN_PROGRESS at last check. Recheck the current PR head and rerun/fix as needed.
- Production deployment on `main` was READY at last check; no production release from this branch.

## Other open PRs / security follow-up
- PR #94: revoke anon/public execution on `public.has_active_paid_subscription()`; production ACL already applied, PR open/unmerged.
- PR #95: revoke TRUNCATE from anon/authenticated on public schema tables; production verified zero grants, PR open/unmerged.
- Keep both PRs tracked; do not merge without explicit approval.
- Security advisor follow-ups previously noted: public leaderboard security-definer view; leaked-password protection disabled; unindexed foreign keys; multiple permissive RLS policies; RLS init/performance warnings. Re-audit before making changes. Leaderboard is lower priority; do not risk breaking it.

## Remaining typing-workspace tasks
1. Extract shared passage/input layout and common keyboard/input helpers only after a behavior-parity test plan exists.
2. Add controller-level tests for timer lifecycle, start-on-first-keystroke, cancel/restart, disabled backspace, highlight and passage visibility.
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
- [ ] Vercel build-rate-limit resolved; preview for exact latest PR head reaches READY.
- [ ] GitHub Actions checks pass for exact latest PR head.
- [ ] Browser smoke tests on preview: canonical URLs, sitemap, robots.txt, manual signup/login, password reset, payment return flow.
- [ ] Admin Website Settings: load, edit, save, reload, audio upload/type/size validation.
- [ ] Typing smoke tests: exam, Self Test, Fix Accuracy; score parity and edge cases.
- [ ] Mobile and desktop layout/accessibility review.
- [ ] Staging DB/RLS/storage validation before any migration.
- [ ] Explicit user approval before merging PR #96 or deploying production.

## Resume instructions
When work resumes, first fetch PR #96's current head SHA, current GitHub Actions run/checks, and Vercel deployments. Compare them with this register and update this file before starting new work. Do not assume the recorded deployment or CI state is still current.
