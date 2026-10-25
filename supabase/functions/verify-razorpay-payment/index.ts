import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Sign in is required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !keyId || !keySecret) {
    return json(503, { error: "Payment verification is temporarily unavailable." });
  }

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json(400, { error: "Invalid JSON body." }); }
  const localOrderId = input.local_order_id;
  const providerOrderId = input.razorpay_order_id;
  const paymentId = input.razorpay_payment_id;
  const signature = input.razorpay_signature;
  if (typeof localOrderId !== "string" || typeof providerOrderId !== "string" ||
      typeof paymentId !== "string" || typeof signature !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(providerOrderId) ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return json(400, { error: "Invalid Razorpay callback fields." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult.user) return json(401, { error: "Your session is invalid. Please sign in again." });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await serviceClient.from("orders")
    .select("id,user_id,provider,provider_order_id,total_minor,currency,status,expires_at")
    .eq("id", localOrderId).eq("user_id", userResult.user.id).maybeSingle();
  if (orderError || !order) return json(404, { error: "Order not found." });
  if (order.provider !== "razorpay" || order.provider_order_id !== providerOrderId) {
    return json(400, { error: "Razorpay order does not match the server-created order." });
  }

  const expected = await hmacHex(keySecret, providerOrderId + "|" + paymentId);
  if (!constantTimeEqual(expected.toLowerCase(), signature.toLowerCase())) {
    return json(400, { error: "Payment signature verification failed." });
  }

  try {
    const response = await fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId), {
      headers: { Authorization: "Basic " + btoa(keyId + ":" + keySecret) },
    });
    const payment = await response.json();
    if (!response.ok || payment.order_id !== providerOrderId ||
        Number(payment.amount) !== Number(order.total_minor) ||
        payment.currency !== order.currency) {
      return json(400, { error: "Provider payment details do not match this order." });
    }
    if (payment.status !== "captured" || payment.captured !== true) {
      return json(409, { error: "Payment is not captured yet. Your order will update after provider confirmation." });
    }

    const { data: finalized, error: finalizeError } = await serviceClient.rpc("service_mark_order_paid", {
      p_order_id: order.id,
      p_provider: "razorpay",
      p_provider_transaction_id: payment.id,
      p_amount_minor: Number(payment.amount),
      p_currency: payment.currency,
      p_verified_payload: {
        source: "checkout_signature_and_provider_api",
        razorpay_order_id: providerOrderId,
        razorpay_payment_id: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        captured: true,
      },
    });
    if (finalizeError) {
      console.error("Verified payment could not be finalized.", finalizeError.code);
      return json(503, { error: "Payment was verified but access update is pending. Do not pay again; refresh shortly." });
    }
    return json(200, { success: true, order_id: order.id, status: finalized?.status || "paid" });
  } catch (error) {
    console.error("Razorpay payment verification request failed.", error instanceof Error ? error.message : "unknown");
    return json(502, { error: "Could not verify payment with the provider. Webhook confirmation will continue." });
  }
});
