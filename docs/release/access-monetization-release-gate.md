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
