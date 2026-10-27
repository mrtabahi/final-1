# Production Migration Reconciliation — Access & Monetization

> Status: BLOCKED pending a reproducible schema reconciliation. This document is a release plan, not authorization to change production.

## Verified environment snapshot — 2026-10-27

- Production project: `nuqfmjgkyfychhwzwnfl`
- Staging project: `lhuqykxddwdkwksdzqth`
- Staging has 27 recorded migrations; production has 22. Their baselines and migration version IDs differ.
- Production does not have the monetization tables `subscription_plans`, `plan_entitlements`, `orders`, `payment_transactions`, `user_subscriptions`, `access_policies`, or `provider_webhook_events`.
- Production has no `create-checkout`, `verify-razorpay-payment`, or `razorpay-webhook` Edge Functions. Do not deploy these before the schema and secrets are ready.
- Staging's access-monetization foundation was recorded as `20261025212505 20261026000100_access_monetization_foundation`; the repository's canonical file is `20261026000100_access_monetization_foundation.sql`. Staging also records helper/hardening migrations not represented by matching canonical filenames in the repository, including `staging_missing_security_helpers`, `staging_schema_alignment_and_hardening`, `staging_restrict_anon_security_definer_rpcs`, and `payment_service_role_claim_compatibility`.
- Staging's subscription display and empty-entitlement guard are recorded as `20261026132543 subscription_plan_display_details` and `20261026133948 block_empty_entitlement_checkout`, while the branch filenames use `20261026065000_subscription_plan_display_details.sql` and `20261026140000_block_empty_entitlement_checkout.sql`.

## Why direct replay is unsafe

The version/name differences indicate that some changes were applied with staging-specific migration names or helper SQL. Applying the repository's full migration folder to production without reconciliation could replay existing changes, omit staging-only fixes, or create behavior differences between environments. A successful staging migration history alone is not proof that the repository contains the exact SQL that produced the current schema.

## Required sequence

1. **Freeze production changes.** Do not merge the feature PR, apply monetization DDL, deploy payment functions, or enable live checkout yet.
2. **Back up and inventory.** Create a verified production backup and export schema definitions, grants, RLS policies, functions, triggers, views, and migration history. Keep secrets and user data out of the repository.
3. **Reconstruct canonical migrations.** Recover the exact SQL for each staging-only/helper migration from source control or the recorded migration artifact. If the exact SQL cannot be recovered, derive a reviewed canonical migration from the current schema and document the differences; do not invent migration history.
4. **Test on an isolated disposable database.** Apply the canonical migration sequence from a clean baseline and compare resulting definitions against staging. Test rollback/recovery on the disposable database.
5. **Review security deltas.** Resolve or explicitly accept the production leaderboard view, privileged RPC grants, and mutable trigger search-path findings. Validate public leaderboard behavior and privacy after any change.
6. **Prepare a production release bundle.** Pin the exact commit, ordered migration list and checksums, Edge Function source hashes, required secret *names* (never values), backup reference, smoke tests, and rollback instructions.
7. **Apply only reviewed production changes.** Use a controlled maintenance window, apply migrations in the reviewed order, verify grants/RLS and function definitions, then deploy the Edge Functions with JWT verification enabled except for the webhook, which must verify Razorpay's raw-body signature itself.
8. **Run post-deploy verification.** Check authenticated plan catalog, checkout creation, payment signature verification, webhook idempotency, refund/late-payment handling, candidate entitlement enforcement, admin operations, and public website routes. Keep live payment activation gated until all evidence is attached.

## Current staging checkout state

- `create-checkout` is ACTIVE at version 11 with JWT verification enabled. Its missing-credentials and provider-request error paths mark the local pending order as failed.
- The active staging plan is explicitly named `STAGING TEST ONLY - ₹1 / 1 day`, has zero entitlements, and staging currently has no active tests/folders. Do not add a site-wide entitlement just to force checkout tests; use a narrow approved fixture or disposable transaction-scoped test data.
- Authenticated Razorpay Test Mode lifecycle tests remain pending. Do not paste API secrets or webhook secrets into chat, commit them, or print them in logs.

## Release decision

**Not production-ready.** Production remains unchanged until the migration history is reconciled, security findings are reviewed, staging Test Mode and access-control tests pass, and the release evidence is complete.
