// File purpose:
// Stripe checkout and webhook helpers for the local backend.

import crypto from "node:crypto";
import { getAppUrl, getStripeSecretKey, getStripeWebhookSecret } from "./config.mjs";

export async function createStripeCheckoutSession({ amount, requestId, requesterEmail, description, request }) {
  const stripeSecretKey = getStripeSecretKey();
  const appUrl = getAppUrl(request);

  if (!stripeSecretKey) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY in .env or .env.local.");
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${appUrl}/messages/${requestId}?payment=success&session_id={CHECKOUT_SESSION_ID}`);
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

export async function getStripeCheckoutSession(sessionId) {
  const stripeSecretKey = getStripeSecretKey();

  if (!stripeSecretKey) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY in .env or .env.local.");
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Could not load the Stripe checkout session.");
  }

  return payload;
}

function parseStripeSignature(signatureHeader) {
  const parts = String(signatureHeader || "").split(",");
  const result = { timestamp: "", signatures: [] };

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") result.timestamp = value || "";
    if (key === "v1" && value) result.signatures.push(value);
  }

  return result;
}

function safeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyStripeWebhookPayload(rawBody, signatureHeader) {
  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
    throw new Error("Stripe webhook signing secret is not configured.");
  }

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || !signatures.length) {
    throw new Error("Stripe webhook signature is missing.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (!signatures.some((signature) => safeEqualHex(expectedSignature, signature))) {
    throw new Error("Stripe webhook signature is invalid.");
  }

  return JSON.parse(rawBody);
}
