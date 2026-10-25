# Payment Provider Integration Contract

Status: Razorpay selected; code is implemented in the feature branch but not deployed. Staging configuration and provider sandbox verification remain required.

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


## Razorpay implementation status (staging only)

Razorpay is the selected provider. The repository now includes:

- `create-checkout`: validates the signed-in candidate, creates a server-priced local order, creates a Razorpay order using server-only credentials, and persists the provider order ID.
- `verify-razorpay-payment`: verifies the checkout HMAC against the server-stored provider order ID, fetches payment status from Razorpay, and only finalizes captured payments with matching amount/currency.
- `razorpay-webhook`: validates the HMAC signature over the exact raw body; handles `order.paid`, `payment.failed`, and `refund.processed`; deduplicates provider event IDs; and records only minimized verification metadata.
- Late captured payments created after the local checkout expiry are recorded without granting subscription access and trigger a server-side full-refund request. If prior partial/multiple refunds make automatic full refund unsafe, the webhook logs the case for manual reconciliation.
- Delayed webhook delivery is accepted when the provider's payment creation timestamp is within the original checkout window; a payment created after expiry is not granted access.

### Staging secrets

Configure these as Supabase Edge Function secrets only. Use Razorpay **Test Mode** credentials.

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. Never add the service-role key or Razorpay secret to browser config, HTML, repository files, or Vercel public environment variables.

### Razorpay dashboard webhook

After the staging Edge Function is deployed, configure the staging function URL as the webhook endpoint and set the same random webhook secret as `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:

- `order.paid`
- `payment.failed`
- `refund.processed`

Keep the endpoint URL and webhook secret specific to staging. Do not configure the live Razorpay webhook until staging evidence is reviewed.

### Required staging tests

- Successful captured payment activates exactly one subscription and is idempotent under callback/webhook replay.
- Invalid checkout signature, invalid webhook signature, wrong provider order ID, wrong amount, wrong currency, and non-captured payment never activate access.
- Failed and abandoned payments do not activate access.
- A delayed webhook for a payment created before checkout expiry still finalizes safely.
- A captured payment created after expiry does not activate access and initiates one full refund; repeated webhook delivery must not create duplicate refunds.
- A full refund revokes active subscription access. Partial or multiple pre-existing refunds are logged for manual reconciliation instead of issuing an unsafe additional refund.
- A provider API timeout after refund initiation can be retried after the lease expires and reconciled against the provider refund list.

## Selection required before implementation

Use Razorpay Test Mode for staging. Live Mode activation remains a separate release decision after the staging checklist passes.
