// File purpose:
// Stripe checkout helper for the local backend.

import { getAppUrl, getStripeSecretKey } from "./config.mjs";

export async function createStripeCheckoutSession({ amount, requestId, requesterEmail, description }) {
  const stripeSecretKey = getStripeSecretKey();
  const appUrl = getAppUrl();

  if (!stripeSecretKey) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY in .env or .env.local.");
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${appUrl}/messages/${requestId}?payment=success`);
  form.set("cancel_url", `${appUrl}/messages/${requestId}?payment=cancelled`);
  form.set("customer_email", requesterEmail);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][product_data][name]", "CampusConnect delivery payment");
  form.set("line_items[0][price_data][product_data][description]", description);
  form.set("line_items[0][price_data][unit_amount]", String(amount));
  form.set("line_items[0][quantity]", "1");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
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
