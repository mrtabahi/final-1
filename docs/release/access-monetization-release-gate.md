# Access & Monetization Release Gate

> Status: NOT APPROVED FOR PRODUCTION until every required gate below has attached evidence. This checklist is intentionally non-destructive and does not authorize production migrations or live Razorpay payments.

## Latest implementation update — 2026-10-27

- Feature branch: `feature/account-subscription-modal`; PR #64 remains open and unmerged. Latest verified commit: `ffcaa01e297db950318b9ac463c10e91e0e6cc3f`.
- CI run [#502](https://github.com/mrtabahi/final-1/actions/runs/40457787382) passed browser syntax checks, Razorpay Edge Function type checks, and the full Node regression suite.
- The plan-admin UI now describes the actual state: checkout and payment verification are implemented, while paid activation remains gated on Test Mode credentials and lifecycle E2E. A regression test prevents the old misleading copy from returning.
- Fixed a plan-admin KPI bug where the entitlement count was calculated and then overwritten with a dash during rendering.
- Fixed checkout-order cleanup: when Razorpay credentials are missing, or the provider order request fails, the local pending order is marked failed before the function returns an error. This prevents orphaned pending orders. The updated `create-checkout` function is deployed to staging as version 11 with JWT verification enabled; no production function was changed.
- Staging catalog remains a test fixture: one active `STAGING TEST ONLY - ₹1 / 1 day` plan, zero entitlements, and zero active tests/folders. Do not add a broad site-wide entitlement just to force a payment test; configure an explicitly approved, narrow staging entitlement or seed disposable fixtures in a transaction and roll them back.
- Razorpay secrets must be verified through Supabase Edge Function Secrets and authenticated staging flows; secret values must not be printed or shared in chat. The database Vault query is not authoritative for Edge Function environment secrets.
- Production remains unchanged. Monetization tables and checkout/payment Edge Functions are not deployed there, and production migration reconciliation plus security review remain release blockers.


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

- Clean PR #54 branch `feature/access-monetization-mainline` is based directly on current `main`, with 16 commits ahead and 0 behind. The original divergent PR #44 is closed and superseded.
- Latest head `eb2885d46673a6358d9b07cce4a4f0c27853dc7b` passed GitHub Actions: **66/66 Node tests**, browser syntax checks, and Deno checks. PR run: https://github.com/mrtabahi/final-1/actions/runs/40266207808 ; push run: https://github.com/mrtabahi/final-1/actions/runs/40266204751 .
- Vercel preview is READY for that exact head: https://final-1-rhbcve5sx-decoding-hcn.vercel.app/ (deployment https://vercel.com/decoding-hcn/final-1/3TbQBoJgoyjom8Ko3EVeT2cffTgZ). Smoke checks returned HTTP 200 for the home page, all six monetization/subscription HTML pages, and all seven related JavaScript assets. The preview config contains the staging Supabase endpoint; the regression suite checks staging selection for preview/localhost and production selection for known production aliases. This is route/config smoke testing, not authenticated browser E2E.
- All four staging Edge Functions (`create-checkout` v5, `verify-razorpay-payment` v5, `razorpay-webhook` v6, `typing-result` v5) were compared with the clean PR source and their `index.ts` files match byte-for-byte. JWT verification is on for checkout, payment verification, and typing results; it is off only for the external Razorpay webhook. The webhook v6 contains the stricter captured-state guard.
- Staging access logic passed 10/10 transaction-only assertions with rollback and cleanup. Payment database lifecycle tests passed for payment success, duplicate-success idempotency, refund, duplicate-refund idempotency, amount mismatch fail-closed, late-payment refund-only handling, duplicate late event idempotency, one-time refund claim, and no subscription grant for late payments. A JSON-only `request.jwt.claims.role=service_role` transaction test passed; all temporary plan/order/transaction/subscription counts were zero after rollback. These are database logic tests, not signed provider callbacks.
- Staging role-context checks confirmed a candidate cannot execute `admin_list_orders`, receives no rows from `admin_get_candidate_emails`, and is not head admin. A production anon-role probe (rolled back) returned no candidate-email rows and false permission/head-admin checks. These do not replace authenticated HTTP/API tests.
- Migration `20261026034331_pin_trigger_function_search_paths.sql` pins `handle_new_user` and `touch_updated_at` to an empty search path. It matches the existing staging migration history, was applied to staging, and was verified in `pg_proc.proconfig`; a rollback-only profile update confirmed the timestamp trigger still works. The foundation migration's four payment service functions now use a compatible service-role claim check (legacy and JSON JWT claim formats), and all five relevant live staging database function bodies match the migration source after normalization.
- Migration `20261026050000_restrict_anon_admin_security_definer.sql` revokes anonymous EXECUTE on `admin_get_candidate_emails`, `has_candidate_permission`, and `is_head_admin` while preserving authenticated EXECUTE. The privilege changes were validated in a production transaction and rolled back; production grants remain unchanged until migration rollout.
- Staging Security Advisor reports 16 RLS-enabled tables without policies, 27 authenticated-executable SECURITY DEFINER functions, one anon-executable SECURITY DEFINER plan-catalog function, and leaked-password protection disabled. A read-only privilege audit confirms the 16 server-managed billing/access tables have no direct SELECT/INSERT/UPDATE/DELETE grants for `anon` or `authenticated`, so the no-policy findings are not directly exposed through table grants. The full function finding set still requires documented authorization disposition.
- Staging catalog inventory has one active plan named `STAGING TEST ONLY - ₹1 / 1 day`, zero plan entitlements, and zero active coupons. This is not a production catalog; real plan pricing, duration, and exact test/folder entitlements must be defined before checkout is enabled.
- Production's monetization schema is not deployed yet: `subscription_plans`, `orders`, `payment_transactions`, `user_subscriptions`, `access_policies`, and `plan_entitlements` are absent. No production migration or Edge Function deployment has been applied.
- Production Security Advisor baseline includes the SECURITY DEFINER view `public.public_leaderboard_attempts`, three anon-executable SECURITY DEFINER functions, and leaked-password protection disabled. The new grant migration addresses the three anon function grants, and the trigger migration addresses the two mutable trigger search paths, but neither has been applied to production. The public leaderboard view is intentionally designed as a restricted public projection, yet it exposes candidate names and performance fields; product/privacy acceptance or a consent/visibility redesign is required before release. Leaked-password protection still needs to be enabled in Supabase Auth settings.
- Authenticated HTTP/REST/RPC and browser E2E tests remain outstanding, as do signed Razorpay Test Mode cases (valid signature, invalid signature, duplicate event, pending/failed payment, amount/currency mismatch, refund, and late payment). The preview is not production-ready until these gates and the production migration/backup/rollback review are complete.

## Latest exact-head verification — 2026-10-26

- Current open draft is PR #54, branch `feature/access-monetization-mainline`; the old PR #44 is closed and must not be used for release tracking.
- Exact current PR head `386b03af2e122df68701f435dd46f860ca0f31a5` passed GitHub Actions run [40266414397](https://github.com/mrtabahi/final-1/actions/runs/40266414397): browser syntax, Deno type-check, and regression test steps all succeeded.
- Latest READY Vercel preview is built from `eb2885d46673a6358d9b07cce4a4f0c27853dc7b` at https://final-1-rhbcve5sx-decoding-hcn.vercel.app/. Comparing that deployment commit with the current PR head shows the only later change is this release-gate documentation file. The exact-head Vercel check still reports the free-tier deployment-rate limit; do not describe the exact-head deployment as successful.
- This reduces the preview/source uncertainty for application code but does not clear authenticated HTTP/browser E2E, signed Razorpay Test Mode, production leaderboard privacy acceptance, production migration/recovery review, or explicit release approval. Production remains unchanged.

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


## Latest customer subscription UI hardening — 27 October 2026

- The standalone subscription page now reads the privacy-safe `get_active_subscription_plan_details` catalog RPC, matching the account upgrade modal.
- Plan cards show configured entitlement labels and disable checkout when the plan has no configured entitlements. This is a UX guard only; server-side checkout validation remains authoritative.
- Regression coverage now asserts the details RPC and the unavailable-plan UI state.
- Vercel preview for the current feature-branch head is READY. This is not a production deployment.
- Still blocked from production release: complete Razorpay Test Mode secrets setup in staging, configure a narrow disposable staging entitlement/test fixture, run signed payment + webhook lifecycle tests, reconcile production migration history, review production security findings, and verify backup/rollback readiness.
