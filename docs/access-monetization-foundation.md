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
5. **Plan builder and entitlements**: configure duration, price/currency, included folders/tests, activation/expiry, renewal/extension, and upgrade/downgrade rules.
6. **Coupons and checkout**: support one plan, selected plans, or universal eligibility; percentage/fixed discounts; validity and usage limits; zero-total checkout without opening a payment gateway.
7. **Payment gateway integration**: select a provider first; verify payment server-side using signed callbacks/webhooks before activating paid entitlements.
8. **User subscription page and operations**: show active plan, start/end date, remaining validity, purchase history, renew/extend, and admin-granted access.
9. **QA and rollout**: run the Node regression suite, apply the migration to a staging project, test expired, revoked, zero-price, refunded, overlapping-plan, and parent/child override cases, and use a reversible rollout. GitHub Actions regression workflow is now configured; successful CI has not yet been confirmed.

## Non-negotiable security checks

- Never rely on frontend hiding, disabled buttons, or local storage to enforce paid access.
- Do not expose a service-role key to browser code.
- Check authorization in the server-side content path and in any database/API path that can return the passage.
- Payment status and amount must be verified server-side; never trust client-submitted prices or a redirect success page.
- Use RLS and least-privilege grants for every new public-schema table.
- Log policy changes, manual entitlements, coupon changes, refunds, and role changes.
- Reconcile repository migrations with the deployed migration history before applying any migration; do not run `db push` until duplicate/out-of-order migration filenames are resolved.
- Test changes against a staging project first. Do not deploy this foundation to production until the full access path is enforced and regression tests pass.

## Decisions intentionally left open

- Payment gateway/provider and supported currencies.
- Whether the first release includes only test/folder access or also study materials, ads, and other website features.
- Whether plan expiry removes access immediately or allows a grace period.
- Refund/cancellation and subscription-extension rules.
