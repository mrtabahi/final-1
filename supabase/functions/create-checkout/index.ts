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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Sign in is required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Missing Supabase environment configuration.");
    return json(503, { error: "Checkout is temporarily unavailable." });
  }

  let input: { plan_id?: unknown; coupon_code?: unknown };
  try {
    input = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }
  if (typeof input.plan_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.plan_id)) {
    return json(400, { error: "A valid plan_id is required." });
  }
  if (input.coupon_code !== undefined && input.coupon_code !== null &&
      (typeof input.coupon_code !== "string" || input.coupon_code.length > 80)) {
    return json(400, { error: "Invalid coupon code." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accessToken = authorization.slice("Bearer ".length);
  const { data: userResult, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userResult.user) return json(401, { error: "Your session is invalid. Please sign in again." });

  const { data: order, error: orderError } = await userClient.rpc("create_checkout_order", {
    p_plan_id: input.plan_id,
    p_coupon_code: typeof input.coupon_code === "string" ? input.coupon_code : null,
  });
  if (orderError || !order) {
    console.warn("Checkout order creation rejected.", orderError?.code);
    return json(400, { error: orderError?.message || "Unable to create checkout order." });
  }

  if (order.status === "free" || Number(order.total_minor) === 0) {
    return json(200, { mode: "free", order });
  }
  if (order.status !== "pending" || !order.order_id || !Number.isSafeInteger(Number(order.total_minor)) || Number(order.total_minor) <= 0) {
    return json(409, { error: "This order cannot enter paid checkout." });
  }

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!keyId || !keySecret) {
    console.error("Razorpay test credentials are not configured.");
    const { error: closeOrderError } = await serviceClient.from("orders")
      .update({ status: "failed" })
      .eq("id", order.order_id)
      .eq("status", "pending");
    if (closeOrderError) {
      console.error("Could not close checkout order after missing credentials.", closeOrderError.code);
    }
    return json(503, { error: "Paid checkout is not configured yet. No payment was started." });
  }
  try {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(keyId + ":" + keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(order.total_minor),
        currency: order.currency,
        receipt: order.order_id,
        notes: { local_order_id: order.order_id, plan_id: order.plan_id },
      }),
    });
    const providerOrder = await response.json();
    if (!response.ok || typeof providerOrder.id !== "string" ||
        Number(providerOrder.amount) !== Number(order.total_minor) ||
        providerOrder.currency !== order.currency) {
      console.error("Razorpay order creation failed.", response.status, providerOrder?.error?.code);
      await serviceClient.from("orders").update({ status: "failed" })
        .eq("id", order.order_id).eq("status", "pending");
      return json(502, { error: "The payment provider could not create checkout. Please try again." });
    }

    const { error: persistError } = await serviceClient.from("orders")
      .update({ provider: "razorpay", provider_order_id: providerOrder.id })
      .eq("id", order.order_id).eq("status", "pending");
    if (persistError) {
      console.error("Could not persist Razorpay order reference.", persistError.message);
      await serviceClient.from("orders").update({ status: "failed" })
        .eq("id", order.order_id).eq("status", "pending");
      return json(503, { error: "Checkout could not be prepared safely. Please retry." });
    }

    return json(200, {
      mode: "razorpay",
      key_id: keyId,
      razorpay_order_id: providerOrder.id,
      amount: Number(order.total_minor),
      currency: order.currency,
      local_order_id: order.order_id,
      plan_name: order.plan_name,
      customer: { name: userResult.user.user_metadata?.full_name || "", email: userResult.user.email || "" },
    });
  } catch (error) {
    console.error("Razorpay order request failed.", error instanceof Error ? error.message : "unknown");
    const { error: closeOrderError } = await serviceClient.from("orders")
      .update({ status: "failed" })
      .eq("id", order.order_id)
      .eq("status", "pending");
    if (closeOrderError) {
      console.error("Could not close checkout order after provider request failure.", closeOrderError.code);
    }
    return json(502, { error: "Unable to reach the payment provider. Please retry." });
  }
});
