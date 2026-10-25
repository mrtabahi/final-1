import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
}

async function sha256Hex(message: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret || !keyId || !keySecret) {
    console.error("Razorpay webhook configuration is incomplete.");
    return json(503, { error: "Webhook configuration is incomplete." });
  }

  const rawBody = await req.text();
  if (rawBody.length === 0 || rawBody.length > 1024 * 1024) return json(400, { error: "Invalid payload size." });
  const suppliedSignature = req.headers.get("x-razorpay-signature") || "";
  const expectedSignature = await hmacHex(webhookSecret, rawBody);
  if (!/^[a-f0-9]{64}$/i.test(suppliedSignature) ||
      !constantTimeEqual(expectedSignature.toLowerCase(), suppliedSignature.toLowerCase())) {
    return json(401, { error: "Invalid webhook signature." });
  }

  let event: Record<string, any>;
  try { event = JSON.parse(rawBody); } catch { return json(400, { error: "Invalid JSON payload." }); }
  if (typeof event.event !== "string") return json(400, { error: "Missing event type." });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const eventId = req.headers.get("x-razorpay-event-id");
  const payloadHash = await sha256Hex(rawBody);

  if (eventId) {
    const { data: existing, error: lookupError } = await serviceClient.from("provider_webhook_events")
      .select("id").eq("provider", "razorpay").eq("provider_event_id", eventId).maybeSingle();
    if (lookupError) return json(503, { error: "Could not check webhook idempotency." });
    if (existing) return json(200, { received: true, duplicate: true });
  }

  let outcome: "processed" | "ignored" = "ignored";
  let eventEntityId: string | null = null;
  try {
    if (event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      if (!payment || typeof payment.id !== "string" || typeof payment.order_id !== "string") {
        return json(400, { error: "Malformed order.paid payload." });
      }
      eventEntityId = payment.id;
      const providerCreatedAt = Number(payment.created_at);
      if (!Number.isFinite(providerCreatedAt)) return json(503, { error: "Provider payment timestamp is unavailable." });
      if (payment.status !== "captured" && payment.captured !== true) {
        console.warn("Ignoring order.paid notification without captured payment state.");
      } else {
        const { data: order, error: orderError } = await serviceClient.from("orders")
          .select("id,total_minor,currency,status,expires_at,provider_order_id")
          .eq("provider", "razorpay").eq("provider_order_id", payment.order_id).maybeSingle();
        if (orderError) return json(503, { error: "Could not resolve local checkout order." });
        if (!order) {
          console.error("Captured Razorpay payment has no local order mapping.", payment.order_id, payment.id);
        } else if (Number(payment.amount) !== Number(order.total_minor) || payment.currency !== order.currency) {
          console.error("Razorpay webhook amount/currency mismatch.", order.id, payment.id);
          return json(400, { error: "Payment amount or currency mismatch." });
        } else if (order.expires_at && providerCreatedAt * 1000 > new Date(order.expires_at).getTime() && order.status === "pending") {
          console.error("Captured payment arrived after local order expiry; manual refund reconciliation required.", order.id, payment.id);
          outcome = "ignored";
        } else {
          const { error: finalizeError } = await serviceClient.rpc("service_mark_order_paid", {
            p_order_id: order.id,
            p_provider: "razorpay",
            p_provider_transaction_id: payment.id,
            p_amount_minor: Number(payment.amount),
            p_currency: payment.currency,
            p_provider_created_at: new Date(providerCreatedAt * 1000).toISOString(),
            p_verified_payload: {
              source: "razorpay_signed_webhook",
              event: event.event,
              event_id: eventId,
              razorpay_order_id: payment.order_id,
              razorpay_payment_id: payment.id,
              status: payment.status,
              amount: Number(payment.amount),
              currency: payment.currency,
              captured: true,
            },
          });
          if (finalizeError) {
            console.error("Payment finalization failed.", finalizeError.code, order.id);
            return json(503, { error: "Verified payment could not be finalized yet." });
          }
          outcome = "processed";
        }
      }
    } else if (event.event === "refund.processed") {
      const refund = event.payload?.refund?.entity;
      if (!refund || typeof refund.id !== "string" || typeof refund.payment_id !== "string") {
        return json(400, { error: "Malformed refund.processed payload." });
      }
      eventEntityId = refund.id;
      const { data: transaction, error: transactionError } = await serviceClient.from("payment_transactions")
        .select("order_id,provider_transaction_id,amount_minor,currency")
        .eq("provider", "razorpay").eq("provider_transaction_id", refund.payment_id).maybeSingle();
      if (transactionError) return json(503, { error: "Could not resolve refund payment." });
      if (!transaction) {
        console.error("Razorpay refund has no local payment transaction.", refund.id, refund.payment_id);
      } else if (Number(refund.amount) !== Number(transaction.amount_minor)) {
        console.error("Partial refund is not automatically supported; manual review required.", transaction.order_id, refund.id);
      } else {
        const { data: finalized, error: refundError } = await serviceClient.rpc("service_mark_order_refunded", {
          p_order_id: transaction.order_id,
          p_provider: "razorpay",
          p_provider_refund_id: refund.id,
          p_amount_minor: Number(refund.amount),
          p_currency: transaction.currency,
          p_verified_payload: {
            source: "razorpay_signed_webhook",
            event: event.event,
            event_id: eventId,
            razorpay_refund_id: refund.id,
            razorpay_payment_id: refund.payment_id,
            amount: Number(refund.amount),
            status: refund.status,
          },
        });
        if (refundError) {
          console.error("Refund finalization failed.", refundError.code, transaction.order_id);
          return json(503, { error: "Verified refund could not be finalized yet." });
        }
        outcome = finalized?.idempotent ? "processed" : "processed";
      }
    } else if (event.event === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      eventEntityId = typeof payment?.id === "string" ? payment.id : null;
      // Failed attempts never activate a subscription. The pending order expires automatically.
      outcome = "ignored";
    } else {
      // Acknowledge unrelated events; configure only order.paid, payment.failed, and refund.processed.
      outcome = "ignored";
    }

    if (eventId) {
      const { error: recordError } = await serviceClient.from("provider_webhook_events").insert({
        provider: "razorpay",
        provider_event_id: eventId,
        event_type: event.event,
        payload_sha256: payloadHash,
        outcome,
      });
      if (recordError && recordError.code !== "23505") {
        console.error("Could not record webhook event audit.", recordError.code);
        return json(503, { error: "Webhook was handled but audit persistence failed." });
      }
    }
    return json(200, { received: true, outcome, entity_id: eventEntityId });
  } catch (error) {
    console.error("Razorpay webhook processing failed.", error instanceof Error ? error.message : "unknown");
    return json(503, { error: "Webhook processing failed." });
  }
});
