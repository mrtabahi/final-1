# Payment Provider Integration Contract

Status: provider-neutral database foundation is implemented; no provider is selected or deployed. This document is the acceptance contract for the next provider-specific implementation.

## Required flow

1. Authenticated candidate requests a checkout through a server Edge Function. The function calls create_checkout_order; the browser never submits a price, discount amount, or final total.
2. If the order total is zero, the database function creates the free order, coupon redemption (when applicable), and subscription atomically. No gateway call is needed.
3. If the order total is positive, the Edge Function creates a hosted checkout/session with the selected provider, stores the provider/session identifiers on the order, and returns only the hosted checkout URL plus public display fields.
4. The provider webhook endpoint verifies the raw request body/signature with the provider secret, validates event type, order mapping, amount, currency, and transaction identifier, then calls service_mark_order_paid using a service-role client.
5. Duplicate payment webhooks are idempotent. The browser return URL is never proof of payment and must not activate access.
6. Refunds are initiated server-side through the provider API. A signed refund webhook is verified before service_mark_order_refunded is called. The current foundation supports full refunds only.
7. Provider API failures, signature failures, mismatched amounts/currencies, expired orders, duplicate transaction IDs, and out-of-order events must fail closed and be logged without exposing secrets.

## Secrets and configuration

- Store credentials only in Supabase Edge Function secrets or the provider's supported secret manager.
- Never commit API keys, webhook secrets, private keys, or service-role keys.
- Never expose provider secret keys to browser JavaScript or return them in RPC payloads.
- Keep provider mode (test/live) explicit and use test credentials in staging.
- Restrict webhook handling to the expected provider and event types; reject unsigned or malformed requests.

## Required provider-specific implementation

- Edge Function to create a hosted checkout session and persist its provider session ID.
- Webhook Edge Function for payment success/failure and full refund events, including raw-body signature verification.
- Provider API timeout/retry strategy and idempotency key per order.
- A reconciliation path for provider-success/database-failure situations.
- Integration tests using the provider's sandbox/test mode.
- Customer page integration that redirects to hosted checkout only after the session has been created.
- Admin order/transaction display of provider session/payment/refund identifiers.
- Staging evidence for paid, failed, expired, duplicate, mismatched amount, refund and webhook retry scenarios.

## Selection required before implementation

Choose the provider and account mode before the provider-specific work starts. For an India/INR-first checkout, likely candidates are Razorpay or Cashfree; Stripe may be appropriate if the merchant account and intended currencies/regions are supported. This is a business/account decision, not something the code should guess.
