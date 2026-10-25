# Access & Monetization — Staging Validation Checklist

This checklist is for a **non-production Supabase project only**. Do not run the migration or deploy the Edge Function against production as part of this checklist.

## 1. Preflight

- Confirm the staging project has a recent schema/data snapshot and a rollback plan.
- Compare the staging `supabase_migrations.schema_migrations` history with the repository migration files before applying anything.
- Apply `supabase/migrations/20261026000100_access_monetization_foundation.sql` to staging.
- Deploy the branch version of `supabase/functions/typing-result/index.ts` to staging only.
- Keep the Paid control disabled until every check below passes.

## 2. Inspect policies

Run in the staging SQL editor:

```sql
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('folders', 'tests')
order by tablename, policyname;
```

Expected:
- `tests_candidate_select` contains `can_access_test(id, auth.uid())`.
- No other permissive candidate-facing SELECT policy on `tests` grants every active test without an entitlement check.
- Admin and staff policies remain present and match the intended access roles.
- Folder listing may expose folder metadata, but not passage content; passage text lives on `tests` and must remain protected by the test SELECT policy.

## 3. Verify access function privileges and audit trail

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'can_access_test'
order by routine_name, grantee;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'access_policy_audit'
order by ordinal_position;
```

Expected:
- `anon` and `PUBLIC` do not have execute permission on `can_access_test`.
- `authenticated` and `service_role` can execute it.
- Folder/test access-mode changes create rows in `access_policy_audit`.
- An authenticated user cannot use `can_access_test(test_id, another_user_id)` to probe another user's entitlement state.

## 4. Role-based scenarios

Use dedicated test accounts; do not alter real candidate/admin accounts.

- Candidate with no subscription can read an active Free test.
- Candidate with no subscription cannot read a Paid test or its passage via direct Supabase Data API SELECT.
- Candidate with an active subscription and matching test entitlement can read the Paid test.
- Folder entitlement grants access only to tests inheriting from that folder; a test-level policy override takes precedence.
- Expired, pending, cancelled, refunded, not-yet-started, and ended subscriptions do not grant access.
- Inactive tests and tests inside inactive folders are denied.
- A scoped `free`/`grant` override grants access only to its matching resource and validity window.
- Admins can manage access policies; staff retain only their existing explicitly granted capabilities.
- Changing access mode writes an audit row with resource, old/new mode, actor, and timestamp.

## 5. Edge Function scenarios

- `start` rejects missing/invalid auth, unknown/inactive tests, unauthorized Paid tests, and inactive parent folders.
- `submit` rejects sessions owned by another user, duplicate submissions, and access revoked after session start.
- Database access-check errors return a fail-closed 503, not a pass.
- The function does not return passage content in its start response.
- Run the repository Node regression suite with `node --test tests/*.test.cjs`.

## 6. Release gate

Do not merge/deploy or enable Paid policies until:
- all scenarios above pass in staging;
- GitHub Actions regression tests are green;
- migration ordering/history is reconciled;
- the payment provider and server-side payment verification flow are decided and tested;
- a rollback path is documented.
