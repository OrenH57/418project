// File purpose:
// Stripe checkout helper for the local backend.

import { APP_URL, STRIPE_SECRET_KEY } from "./config.mjs";

export async function createStripeCheckoutSession({ amount, requestId, requesterEmail, description }) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY in .env or .env.local.");
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${APP_URL}/messages/${requestId}?payment=success`);
  form.set("cancel_url", `${APP_URL}/messages/${requestId}?payment=cancelled`);
  form.set("customer_email", requesterEmail);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][product_data][name]", "CampusConnect delivery payment");
  form.set("line_items[0][price_data][product_data][description]", description);
  form.set("line_items[0][price_data][unit_amount]", String(amount));
  form.set("line_items[0][quantity]", "1");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Stripe checkout session failed.");
  }

  return payload;
}
