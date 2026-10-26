# Access & Monetization Release Gate

> Status: NOT APPROVED FOR PRODUCTION until every required gate below has attached evidence. This checklist is intentionally non-destructive and does not authorize production migrations or live Razorpay payments.

## 1. Change and environment control
- [ ] Confirm PR head SHA and target branch; keep the feature PR unmerged until all gates pass.
- [ ] Confirm Vercel Preview points only to the staging Supabase project (`lhuqykxddwdkwksdzqth`). Do not print or commit secrets.
- [ ] Confirm production Supabase project (`nuqfmjgkyfychhwzwnfl`) and production domains were not changed by staging work.
- [ ] Record the exact migration filenames and checksums deployed to staging; reconcile manual/helper migrations with repository SQL before production planning.

## 2. Automated CI
- [ ] Latest GitHub Actions run for the exact PR head SHA is green.
- [ ] Browser JavaScript syntax checks pass.
- [ ] `deno check` passes for `create-checkout`, `verify-razorpay-payment`, and `razorpay-webhook`.
- [ ] `node --test tests/*.test.cjs` passes; retain the test summary and commit SHA.
- [ ] Confirm tests execute on both feature-branch pushes and PRs targeting `main`.

## 3. Access control and data isolation (staging fixtures only)
- [ ] Anonymous request cannot read paid test content or private candidate/payment data.
- [ ] Free candidate can read only Free resources and resources inherited as Free.
- [ ] Paid candidate with a valid active entitlement can read the intended Paid resource.
- [ ] Expired, cancelled, revoked, or wrong-user subscription does not grant access.
- [ ] `Inherit` resolves consistently from folder policy; explicit test policy overrides inheritance as specified.
- [ ] Inactive test or parent folder is denied at both read and result submission time.
- [ ] Candidate cannot change another candidate's subscription, order, payment, attempt, or entitlement.
- [ ] Direct REST access and RPC execution are tested separately from UI visibility.

## 4. Razorpay Test Mode
- [ ] Successful checkout validates owner, provider order ID, amount, currency, and captured state.
- [ ] Invalid/missing webhook signature is rejected without state changes.
- [ ] Duplicate webhook delivery is idempotent and does not duplicate transactions/subscriptions.
- [ ] Failed, pending, and cancelled payment do not activate a paid subscription.
- [ ] Amount/currency mismatch is rejected and logged without exposing secrets.
- [ ] Full refund is idempotent and revokes the subscription access according to policy.
- [ ] Late captured payment after expiry follows the guarded refund/reconciliation path.
- [ ] Provider timeout/retry reconciles existing refunds before issuing a new refund.
- [ ] Attach provider Test Mode event IDs, local order/transaction IDs, and redacted logs; never attach secrets or full payment credentials.

## 5. Database security and migration quality
- [ ] Review every Security Advisor finding and record intentional vs actionable, with rationale.
- [ ] Confirm all `SECURITY DEFINER` functions have least-privilege EXECUTE grants, explicit safe `search_path`, and authorization checks in their bodies.
- [ ] Confirm exposed views do not bypass RLS unintentionally; use invoker semantics or restrict grants as appropriate.
- [ ] For tables with RLS enabled but no policies, verify whether zero browser access is intentional and validate table grants.
- [ ] Review unindexed foreign keys against real query paths; add indexes only where justified.
- [ ] Validate migrations on an isolated clean database or disposable project; do not reset shared staging or production.
- [ ] Verify rollback/recovery steps preserve payment, refund, audit, and attempt history.

### Initial staging security audit snapshot — 2026-10-26
This is an evidence snapshot, not a production sign-off.

- Verified with database privilege checks that the inspected monetization tables (`orders`, `payment_transactions`, `user_subscriptions`, `subscription_plans`, `plan_entitlements`, `provider_webhook_events`, `coupons`, `coupon_redemptions`, `access_policies`, `access_policy_audit`, `user_entitlement_overrides`, and `typing_exam_sessions`) have no direct SELECT/INSERT/UPDATE/DELETE privileges for `anon` or `authenticated`; `service_role` has table privileges. This supports the intentional server-managed design, but the full API/UI flow still needs testing.
- Security Advisor reports 16 RLS-enabled tables with no policies. For the inspected billing/access tables, zero browser grants were confirmed. Keep these findings documented as intentional only after verifying every table and its callers.
- `get_active_subscription_plans()` is executable by `anon` and `authenticated`, is SECURITY DEFINER, pins `search_path`, and returns only active plan catalog fields. Public execution may be intentional; verify the returned fields and keep the rationale documented.
- The advisor also reports authenticated-executable SECURITY DEFINER RPCs. A read-only scan found authorization-check markers and explicit search paths on the inspected functions, but regex markers are not proof; inspect each function body and test non-admin calls before accepting the findings.
- A read-only staging fixture inventory on 2026-10-26 found one candidate profile but zero active tests and zero active folders. A transaction-only SQL test then created disposable fixtures inside an explicit transaction and rolled the transaction back. The database access function passed 10 assertions: free access, paid denied without subscription, inherited-free access, inherited-paid denied without subscription, active paid entitlement, inherited-paid entitlement, expired subscription denied, override grant, inactive test denied, and cross-user probing denied. A follow-up read-only count confirmed zero fixture rows remained. This validates the database function logic only; real authenticated API/REST/RPC and browser flows still require testing.
- Code review found the Razorpay `order.paid` handler used an AND condition when checking `status === "captured"` and `captured === true`, which could accept an inconsistent state when only one signal matched. The feature branch now requires both signals, and a regression test covers the stricter guard. CI run: https://github.com/mrtabahi/final-1/actions/runs/40262525578 (56/56 Node tests passed; Deno checks passed).
- Transaction-only access test outcome: 10/10 assertions passed; all fixture rows were rolled back and independently verified absent. This was a direct SQL invocation of `public.can_access_test`, not an authenticated HTTP API test.
- Production advisor findings were observed separately. No production database changes were made as part of this audit.

## Current release blockers and latest verification — 2026-10-26

- The newest commit's combined status currently reports a **Vercel failure** with the build-rate-limit URL. The latest READY preview observed in Vercel is for commit `7c1ed39958d5c1c8a8d2ca2963beec39d2fec2f7`, not the newest security-test commit. Do not treat the old preview as verification of current source.
- GitHub compare reports the feature branch is **181 commits ahead and 8 behind** `main` (diverged). Review and reconcile the base branch before merge; do not perform a blind merge or production promotion.
- Staging Razorpay webhook was found to differ from the feature branch: deployed version 5 used an `&&` check for the captured status/flag, while branch source requires `||` so both signals must match. Deployed the exact branch `index.ts` to staging as version 6, preserved `verify_jwt=false` for the external provider callback, and re-read it. Verification confirmed the live staging function is byte-for-byte identical to branch source and contains the strict guard. No production function was changed. This deployment has not yet been validated with signed Razorpay Test Mode events.
- Staging Security Advisor still reports 16 RLS-enabled tables without policies, 27 authenticated-executable SECURITY DEFINER function findings, one anon-executable SECURITY DEFINER plan-catalog function, and leaked-password protection disabled. Initial source inspection shows admin RPCs checked in this sample require the current user to be an administrator, but the entire finding set still needs a systematic disposition and authenticated negative tests.
- Production Security Advisor (read-only) reports one SECURITY DEFINER view (`public.public_leaderboard_attempts`), mutable search paths on `handle_new_user` and `touch_updated_at`, three anon-executable SECURITY DEFINER functions (`admin_get_candidate_emails`, `has_candidate_permission`, `is_head_admin`), seven authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled. Follow-up read-only inspection confirmed the leaderboard view is SELECT-granted to `anon` and `authenticated`, is not RLS-enabled, and its SECURITY DEFINER definition reads `attempts` and `tests` while returning candidate name, language, duration, timestamps, gross/net WPM, accuracy, and test title. The underlying `attempts` table has RLS policies for self/admin/staff, but anon has SELECT on the view; the view filter includes 31 rows out of 34 attempts because `leaderboard_enabled` defaults to true when null. Treat this as an actionable privacy/release blocker until the intended public leaderboard disclosure is explicitly confirmed and the view is redesigned/restricted accordingly. Do not blindly flip it to SECURITY INVOKER because that may break the leaderboard; first design and test an explicit public projection/consent policy. Mutable search paths and anon-callable functions also need documented rationale or safe remediation. These are observations only; no production changes were made.
- The new source-level typing-result security test is committed, but the combined status lookup for its commit reports the Vercel build-rate-limit failure and no successful current-head GitHub Actions result was returned. The prior green CI run is evidence for its earlier SHA only, not this exact head.
- Authenticated HTTP/REST/RPC and browser end-to-end tests are still outstanding. The 10/10 transaction-only access function assertions are not a substitute for these checks.

## 6. Release decision
- [ ] All CI and functional gates pass with evidence tied to the same commit.
- [ ] Security findings are fixed or formally accepted with documented rationale.
- [ ] Staging end-to-end test report reviewed.
- [ ] Production migration plan, backup/recovery plan, and approver identified.
- [ ] Explicit release approval recorded before production migrations, domain promotion, or live payment activation.

## Evidence template
- PR URL / head SHA:
- CI run URL and summary:
- Preview URL / tested timestamp:
- Staging project ref:
- Migration list and checksums:
- Access-control test results:
- Razorpay Test Mode evidence (redacted):
- Security Advisor findings and disposition:
- Rollback/recovery owner:
- Release decision / approver:
