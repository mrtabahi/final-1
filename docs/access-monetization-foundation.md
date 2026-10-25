# Access & Monetization Foundation

Status: implementation in draft PR #44. The migration and Edge Function changes are committed on the feature branch only; neither has been applied/deployed to production.

## Current verified baseline

- The admin navigation already has Overview, Folders & Tests, Results & Attempts, Candidates, PDF & Study Materials, Website Content, Workspace Banner Text, Analytics & Reports, Security & Audit, Website Settings, plus planned Plans & Subscriptions, Payments & Coupons, and Roles & Permissions.
- Supabase currently has `public.folders` and `public.tests`, both with RLS enabled. The folders table has no access/price field. The tests table has no access/price field. No subscription, plan, coupon, order, or entitlement tables were found in the current public schema inventory.
- Existing candidate SELECT policies allow active folders/tests to be read by authenticated users. Because test passages are stored in `public.tests`, simply hiding a paid test in the UI would not protect its content.
- Therefore, do not ship UI-only Free/Paid toggles. Access is being enforced in the proposed RLS policy and typing-result Edge Function; staging validation is still required before paid content is released.
- The migration adds a server-managed audit trail for folder/test access-mode changes and prevents authenticated callers from probing entitlement results for arbitrary user IDs.
- Current production Vercel deployment is connected to `mrtabahi/final-1`; work is isolated on branch `feature/access-monetization-foundation`. No production deployment or Supabase schema was changed.

## Admin navigation proposal

### 1. Overview
- Platform dashboard
- Access & revenue snapshot (shown only when monetization is enabled)
- Recent orders and subscription events
- Access/security alerts
- Quick actions

### 2. Exam Management
- Folders & Tests
  - Folder hierarchy and ordering
  - Test editor and preview
  - Bulk import/review
  - Access & pricing (Free / Paid / Inherit)
- Results & Attempts
- Candidates & Accounts
- PDF & Study Materials

### 3. Business & Access
- Website Access & Monetization
  - Site-wide access mode and default policy
  - Menu/submenu access mapping
  - Folder/test access rules
  - Access-policy preview and impact summary
- Plans & Subscriptions
- Coupons & Promotions
- Payments, Orders & Refunds
- User Entitlements & Manual Overrides

### 4. Website Experience
- Pages, Menus & Navigation
- Announcements, Banners & Offers
- Branding & Appearance
- Advertisements & AdSense

### 5. System & Governance
- Analytics & Business Reports
- Security & Audit Logs
- Admin Roles & Permissions
- Platform Settings & Integrations

Existing functional modules should be preserved and moved into a clearer information architecture rather than replaced with placeholders.

## Access policy semantics

- Values: `inherit`, `free`, `paid`.
- New folders/tests default to `paid`; the create form may explicitly choose Free.
- `inherit` resolves from the nearest parent policy. A test-level Free/Paid value overrides its folder; a folder-level value applies to children that inherit.
- A site-level mode of `mixed` allows public/free and premium content together. A temporary emergency lock should be separate from the durable access policy and require an explicit confirmation.
- Access to content is granted by a valid subscription entitlement or a narrowly scoped administrator override; a profile boolean such as `paid_user=true` is not sufficient.
- A paid item can be visible in listings with a lock/price preview, but the passage/content must not be returned to an unauthorized client.
- Admin/staff permissions for editing access rules must be enforced server-side and written to an audit log.

## Proposed implementation sequence

1. **Schema and policy review**: map current RLS and all readers of folders/tests; agree on migration and rollback.
2. **Central access model**: add normalized policy/plan/entitlement primitives with RLS, indexes, audit events, and server-side resolution.
3. **Safe content delivery**: change candidate read paths so paid passage data is only returned after an entitlement check; test direct Data API and Edge Function access. The current branch adds an entitlement-aware `tests` SELECT policy and start/submit checks.
4. **Folders & Tests UI**: add an Access & Pricing panel with Free/Paid/Inherit, default Paid, clear inherited-state labels, bulk edits, and an impact preview.
5. **Plan builder and entitlements**: admin plan editor now supports duration, price/currency, active/inactive catalog state, site/folder/test entitlements, and a transaction-safe admin RPC. Subscription lifecycle, renewal/extension, and upgrade/downgrade operations remain future work.
6. **Coupons and checkout**: support one plan, selected plans, or universal eligibility; percentage/fixed discounts; validity and usage limits; zero-total checkout without opening a payment gateway.
7. **Payment gateway integration**: select a provider first; verify payment server-side using signed callbacks/webhooks before activating paid entitlements.
8. **User subscription page and operations**: show active plan, start/end date, remaining validity, purchase history, renew/extend, and admin-granted access.
9. **QA and rollout**: run the Node regression suite, apply the migration to a staging project, test expired, revoked, zero-price, refunded, overlapping-plan, and parent/child override cases, and use a reversible rollout. GitHub Actions regression workflow is configured; the latest branch run passed all 28 tests. This is static/regression validation only, not a substitute for Postgres/RLS/Edge Function integration tests.

## Non-negotiable security checks

- Never rely on frontend hiding, disabled buttons, or local storage to enforce paid access.
- Do not expose a service-role key to browser code.
- Check authorization in the server-side content path and in any database/API path that can return the passage.
- Payment status and amount must be verified server-side; never trust client-submitted prices or a redirect success page.
- Use RLS and least-privilege grants for every new public-schema table.
- Log policy changes, manual entitlements, coupon changes, refunds, and role changes.
- Reconcile repository migrations with the deployed migration history before applying any migration; do not run `db push` until duplicate/out-of-order migration filenames are resolved.
- Test changes against a staging project first. Do not deploy this foundation to production until the full access path is enforced and regression tests pass.

## Latest validation snapshot (2026-10-26)

- Latest feature-branch regression run passed 28/28 tests.
- Read-only production migration inventory ends at version `20261025181440`; the proposed migration version `20261026000100` sorts after it. The migration has not been applied.
- Read-only production policy inspection confirmed `tests_candidate_select` currently permits every active test, while `tests_admin_all` and `tests_staff_manage` are separate permissive policies. The migration replaces only the candidate SELECT policy. Because PostgreSQL permissive policies combine with OR, staging must verify the exact predicates and role membership; do not weaken the admin/staff scopes or leave any broad candidate-facing SELECT policy.
- No Supabase development branches were found for the production project or the other active project inspected. The inactive project is not presumed to be staging. No staging target is currently verified, so no migration or function deployment is safe yet.
- The Vercel deployment check is rate-limited; no deployment was performed.

## Latest development increment (2026-10-26)

- Added `admin-plans.html` with a responsive subscription plan catalog/editor, linked from the main admin navigation.
- Added admin-only SECURITY DEFINER RPCs to list plans, read plan entitlements, validate plan fields, and save plan plus entitlements in one database transaction. Billing tables remain inaccessible to browser clients directly.
- Added regression assertions for admin-only RPC boundaries, field validation, atomic save structure, and UI use of RPCs instead of direct billing-table access.
- Checkout, payment provider/webhook verification, subscription activation/expiry operations, and real staging database validation are not implemented/verified yet. The page explicitly warns that checkout is not connected; do not enable a paid launch based on the plan editor alone.

## Coupon catalog increment (2026-10-26)

- Added `admin-payments.html` for coupon creation/editing, percentage/fixed discounts, selected-plan or all-plan scope, validity windows, and redemption limits.
- Coupon listing, eligibility lookup, and save operations use admin-only SECURITY DEFINER RPCs; coupon fields and plan eligibility are written atomically.
- Regression tests cover RPC-only browser access and server-side validation. No checkout, coupon redemption, payment capture, refund, or subscription activation flow is enabled.

## Manual entitlement operations increment (2026-10-26)

- Added `admin-entitlements.html` to create, edit and revoke user-specific test/folder overrides with validity dates and a required reason.
- Added admin-only RPCs and an audit table/trigger recording before/after state, actor and timestamp. Revocation sets an end time rather than deleting the record.
- The UI explicitly limits this first version to test/folder overrides; disabled tests and disabled parent folders remain blocked by the access resolver.
- Automated regression checks cover the RPC boundary and audit hooks; database behavior still requires staging integration tests.

## Subscription operations increment (2026-10-26)

- Added `admin-subscriptions.html` for reviewing subscription records and issuing/cancelling documented manual grants.
- Added admin-only RPCs for listing subscriptions, granting an active plan to a candidate, and cancelling active/pending subscriptions. Manual grants require a reason and an explicit confirmation.
- Added a server-managed subscription audit table/trigger that records before/after state and actor. Manual grants are not a payment flow; payment verification remains a separate required phase.

## Checkout/order foundation increment (2026-10-26)

- Added a server-priced `create_checkout_order` RPC that validates active plans, coupon scope/validity/currency/limits, computes discounts server-side, reserves coupon capacity for 15 minutes, and activates zero-total purchases atomically.
- Added a service-role-only `service_mark_order_paid` RPC that checks order amount/currency, rejects expired orders, creates a payment transaction, activates a subscription from the order's duration snapshot, and handles duplicate callbacks idempotently.
- Razorpay is now the selected provider and checkout/webhook Edge Function code is implemented in the feature branch. It is not deployed; do not enable live payments or call finalization RPCs except through the signed provider verification path.

## Razorpay integration increment (2026-10-26)

- Added server-side `create-checkout` to create a local order from trusted plan pricing/coupon rules, create a Razorpay order, and persist the provider order ID.
- Added `verify-razorpay-payment` to verify the Razorpay checkout HMAC against the server-stored order ID, fetch payment state from Razorpay, and activate only captured payments with matching amount/currency.
- Added `razorpay-webhook` with raw-body HMAC verification, event-ID deduplication, minimized audit metadata, and handling for `order.paid`, `payment.failed`, and `refund.processed`.
- Delayed webhooks may finalize when the provider payment was created within the original checkout expiry window. Captured payments created after expiry never activate access and trigger an idempotent full-refund workflow; existing partial/multiple refunds are flagged for manual reconciliation.
- Added private webhook event ledger and a two-minute refund-processing lease to reduce duplicate provider refund requests.
- Added Razorpay order references to the admin order view and enabled authenticated paid checkout on the customer subscription page.
- This remains staging-only code. Supabase migration, Edge Functions, Razorpay Test Mode secrets, dashboard webhook configuration, and end-to-end sandbox validation are still pending.

## Customer subscription overview increment (2026-10-26)

- Added `my-subscription.html`, linked from the public site, account and results navigation.
- Added a public-safe active-plan catalog RPC and an authenticated self-only subscription/order history RPC. The browser never directly queries server-managed subscription/order tables.
- Free plans can be activated through server-priced order creation; paid plan buttons remain disabled until the payment provider and verified checkout are implemented.
- Regression tests cover account scoping and RPC-only data access. Staging integration and UI browser testing are still required.

## Order and transaction operations increment (2026-10-26)

- Extended the admin Payments & Coupons page with read-only order and payment-transaction history through role-checked RPCs.
- The UI intentionally does not expose raw provider payloads or offer a manual “mark paid” control. Payment finalization remains restricted to the service-role verifier path.

## Refund lifecycle foundation (2026-10-26)

- Added a service-role-only full-refund finalization RPC that validates the refunded amount/currency, stores provider refund metadata, marks the order and payment transaction refunded, and revokes any active subscription tied to the order.
- Duplicate verified refund callbacks are idempotent. Partial refunds and provider-specific refund initiation remain out of scope until the payment provider is selected.
- The admin transaction view shows refund identifiers/timestamps but has no manual refund or status-forcing control.

## Decisions intentionally left open

- Payment gateway/provider and supported currencies.
- Whether the first release includes only test/folder access or also study materials, ads, and other website features.
- Whether plan expiry removes access immediately or allows a grace period.
- Refund/cancellation and subscription-extension rules.
