# Access & Monetization Rollback Runbook

This runbook is for a verified staging project first. Do not execute these steps on production without an incident owner, backup, and explicit approval.

## Before migration application

- If the migration fails before COMMIT, PostgreSQL should roll back the migration transaction. Inspect the failure and correct the SQL before retrying.
- Do not partially apply statements manually outside the migration transaction.
- Keep the Paid UI disabled and do not deploy a provider webhook before schema/RLS checks pass.

## Functional rollback to legacy “all active tests are free” behavior

Use this only when the new access policy is causing an availability regression and the incident owner has decided to temporarily restore legacy access. This intentionally makes all active tests readable by authenticated candidates, matching the pre-monetization behavior.

1. Disable checkout entry points and paid-plan promotions.
2. Expire all user entitlement overrides so they cannot re-apply a paid restriction.
3. Set every existing test and folder access mode to free, and change column defaults back to free.
4. Keep tests_candidate_select requiring active = true AND can_access_test(...); do not replace it with a broad unconditional policy.
5. Verify active tests in active folders are readable by a candidate and inactive tests/folders remain blocked.
6. Keep the migration tables and audit logs. Do not drop billing tables or functions if any order, payment, subscription, coupon, or audit records exist.

Illustrative staging-only SQL (review IDs/project before running):

```sql
BEGIN;
UPDATE public.user_entitlement_overrides
SET starts_at = CASE WHEN starts_at IS NULL OR starts_at >= now() THEN now() - interval '1 second' ELSE starts_at END,
    ends_at = now()
WHERE ends_at IS NULL OR ends_at > now();

UPDATE public.tests SET access_mode = 'free';
UPDATE public.folders SET access_mode = 'free';
ALTER TABLE public.tests ALTER COLUMN access_mode SET DEFAULT 'free';
ALTER TABLE public.folders ALTER COLUMN access_mode SET DEFAULT 'free';
COMMIT;
```

## Security-incident rollback

If the entitlement gate appears to expose content to unauthorized candidates:

- Immediately disable candidate test-start entry points and paid checkout.
- Keep the RLS gate fail-closed. Do not change the candidate SELECT policy to unconditional active = true.
- If necessary, temporarily remove candidate SELECT access to tests while preserving admin/staff policies, and make the typing-result Edge Function fail closed.
- Preserve audit/order/payment records for investigation; do not delete or rewrite audit history.
- Restore candidate access only after a corrected policy/function is validated with direct Data API tests in staging.

## After rollback

- Record the incident, migration/function versions, actor, and timestamps.
- Re-run the entire staging checklist and regression suite.
- Do not re-enable Paid controls until a new validation pass is approved.
