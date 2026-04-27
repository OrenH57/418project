// File purpose:
// Shared idempotency helpers for create-style backend operations.

import crypto from "node:crypto";

export const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  return key.length <= 120 ? key : "";
}

export function getSafeIdempotencyKeyRef(value) {
  const key = normalizeIdempotencyKey(value);
  return key ? `...${key.slice(-8)}` : "";
}

export function createIdempotencyExpiry(now = new Date()) {
  return new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  return value;
}

export function createRequestFingerprint(body) {
  const { idempotencyKey, ...fingerprintBody } = body && typeof body === "object" ? body : {};
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(fingerprintBody))).digest("hex");
}
