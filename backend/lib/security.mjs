// File purpose:
// Small HTTP security helpers for request limits, CORS, rate limits, and uploaded data URLs.

import { getAppUrl } from "./config.mjs";

export const DEFAULT_BODY_LIMIT_BYTES = 256 * 1024;
export const IMAGE_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i;

function parseAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([
    getAppUrl(),
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...configured,
  ]);
}

function isLocalOrigin(origin) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
}

export function getAllowedOrigin(request) {
  const origin = request.headers.origin || "";
  const allowedOrigins = parseAllowedOrigins();

  if (origin && allowedOrigins.has(origin)) return origin;
  if (origin && isLocalOrigin(origin)) return origin;
  if (!origin) return getAppUrl(request);
  return "";
}

export function buildSecurityHeaders(request) {
  const allowedOrigin = getAllowedOrigin(request);
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "Cross-Origin-Resource-Policy": "same-site",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function getClientKey(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || request.socket.remoteAddress || "unknown";
}

export function createRateLimiter({ windowMs, max, keyPrefix = "" }) {
  const buckets = new Map();

  return function checkRateLimit(key) {
    const now = Date.now();
    const bucketKey = `${keyPrefix}:${key || "unknown"}`;
    const current = buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    current.count += 1;
    if (current.count <= max) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  };
}

export function createRouteRateLimiter(rules) {
  const limiters = rules.map((rule) => ({
    ...rule,
    check: createRateLimiter(rule),
  }));

  return function checkRouteRateLimit(request, url, userId = "") {
    const identity = userId || getClientKey(request);

    for (const rule of limiters) {
      if (!rule.matches(request, url)) continue;
      const result = rule.check(`${identity}:${request.method}:${url.pathname}`);
      if (!result.allowed) {
        return result;
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  };
}

export function getBodyLimitForRequest(request, url) {
  if (url.pathname === "/api/requests" || url.pathname === "/api/auth/signup" || url.pathname === "/api/auth/outlook") {
    return IMAGE_BODY_LIMIT_BYTES;
  }
  if (url.pathname === "/api/profile") {
    return IMAGE_BODY_LIMIT_BYTES;
  }
  return DEFAULT_BODY_LIMIT_BYTES;
}

export function validateDataImage(value, { required = false, maxBytes = 2 * 1024 * 1024 } = {}) {
  const image = String(value || "").trim();
  if (!image) {
    return required ? { ok: false, error: "Image upload is required." } : { ok: true, value: "" };
  }

  const match = DATA_IMAGE_PATTERN.exec(image);
  if (!match) {
    return { ok: false, error: "Upload must be a PNG, JPEG, WEBP, or GIF image." };
  }

  const normalizedBase64 = match[2].replace(/\s+/g, "");
  let bytes;
  try {
    bytes = Buffer.from(normalizedBase64, "base64");
  } catch {
    return { ok: false, error: "Image upload could not be decoded." };
  }

  if (!bytes.length || bytes.length > maxBytes) {
    return { ok: false, error: `Image upload must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.` };
  }

  return { ok: true, value: `data:${match[1].toLowerCase()};base64,${normalizedBase64}` };
}

export function truncateText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
