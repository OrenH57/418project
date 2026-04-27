// File purpose:
// Lightweight local backend for the CampusConnect prototype.
// Handles auth, requests, messages, profile updates, verification, and optional Stripe checkout.

import http from "node:http";
import path from "node:path";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import {
  DISCOUNT_RATE,
  MIN_PAYMENT_OFFER,
  loadEnv,
} from "./lib/config.mjs";
import { createToken, hashPassword, isCampusEmail, verifyPassword } from "./lib/auth.mjs";
import { buildAdminOverview, applyAutomaticModeration, blockedRequestKeywords, requireAdmin } from "./lib/admin.mjs";
import { DELIVERY_LOCATIONS, getDeliveryPricingForLocation } from "./lib/deliveryPricing.mjs";
import {
  createIdempotencyExpiry,
  createRequestFingerprint,
  getSafeIdempotencyKeyRef,
  normalizeIdempotencyKey,
} from "./lib/idempotency.mjs";
import {
  canAccessRequest,
  decorateRequest,
  findRecentDuplicateRequest,
  findRecentSimilarSubmission,
  getCampusSnapshot,
  isActiveRequestStatus,
} from "./lib/requests.mjs";
import { verifyMicrosoftIdToken } from "./lib/microsoftAuth.mjs";
import { createStripeCheckoutSession, getStripeCheckoutSession } from "./lib/payments.mjs";
import { buildPaymentTotal, formatPaymentAmount, parseOptionalTip } from "./lib/paymentPolicy.mjs";
import {
  buildSecurityHeaders,
  createRouteRateLimiter,
  getBodyLimitForRequest,
  truncateText,
  validateDataImage,
} from "./lib/security.mjs";
import { createMongoDataAdapter } from "./lib/data/adapters.mjs";
import { createDataRepository } from "./lib/data/repository.mjs";
import { SESSION_TTL_MS, isExpiredSession } from "./lib/data/normalize.mjs";
import {
  handleAdminRoute,
  handleMessagingRoute,
  handlePaymentsRoute,
  handleProfileRoute,
  handleRatingsRoute,
} from "./lib/routeGroups.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

await loadEnv();
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is missing from .env");
}

const client = new MongoClient(mongoUri);
await client.connect();

const db = client.db("campusconnect");

function hasSameIndexSpec(existingIndex, expectedKey, expectedOptions = {}) {
  const existingKeyEntries = Object.entries(existingIndex.key || {});
  const expectedKeyEntries = Object.entries(expectedKey);

  if (existingKeyEntries.length !== expectedKeyEntries.length) {
    return false;
  }

  for (const [key, value] of expectedKeyEntries) {
    if (existingIndex.key?.[key] !== value) {
      return false;
    }
  }

  if (typeof expectedOptions.unique === "boolean" && Boolean(existingIndex.unique) !== expectedOptions.unique) {
    return false;
  }

  return true;
}

async function ensureIndex(collection, key, options = {}) {
  try {
    await collection.createIndex(key, options);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 85) {
      const indexes = await collection.listIndexes().toArray();
      const alreadyCovered = indexes.some((entry) => hasSameIndexSpec(entry, key, options));

      if (alreadyCovered) {
        return;
      }
    }

    throw error;
  }
}

const MAX_ACTIVE_REQUESTS_PER_USER = 3;
const ORDER_CREATION_LOCK_TTL_MS = 30 * 1000;
const checkAnonymousRateLimit = createRouteRateLimiter([
  {
    keyPrefix: "auth",
    windowMs: 15 * 60 * 1000,
    max: 20,
    matches: (request, url) => request.method === "POST" && url.pathname.startsWith("/api/auth/"),
  },
  {
    keyPrefix: "general",
    windowMs: 60 * 1000,
    max: 120,
    matches: (request, url) => url.pathname.startsWith("/api/"),
  },
]);
const checkUserRateLimit = createRouteRateLimiter([
  {
    keyPrefix: "mutation",
    windowMs: 60 * 1000,
    max: 60,
    matches: (request) => request.method === "POST" || request.method === "PATCH",
  },
  {
    keyPrefix: "messages",
    windowMs: 60 * 1000,
    max: 20,
    matches: (request, url) => request.method === "POST" && url.pathname.startsWith("/api/messages/"),
  },
]);

function logBackendEvent(event, details = {}) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...details,
  }));
}

const dataRepository = createDataRepository(
  createMongoDataAdapter(db, { ensureIndex }),
  { log: logBackendEvent },
);

const readData = dataRepository.readData;
const writeData = dataRepository.writeData;

function createSessionRecord(userId) {
  const createdAt = new Date();

  return {
    token: createToken(),
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString(),
  };
}

async function replaceUserSessionAtomic(userId) {
  const session = createSessionRecord(userId);
  return await dataRepository.replaceUserSession(userId, session);
}

function getDuplicateKeyErrorMessage(error) {
  if (error?.code === "USER_UNIQUE_INDEXES_UNAVAILABLE") {
    return "Account creation is temporarily disabled while duplicate existing accounts are being reviewed.";
  }

  if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
    return "";
  }

  const keyPattern = error.keyPattern || {};
  if ("email" in keyPattern) {
    return "That email is already registered.";
  }
  if ("id" in keyPattern) {
    return "That account already exists.";
  }

  return "That record already exists.";
}

function getUserCreationGuardError(user) {
  const validRoles = new Set(["requester", "courier", "admin"]);
  const validAuthProviders = new Set(["password", "outlook"]);

  if (!user?.id) return "User id is required.";
  if (!user.name || typeof user.name !== "string") return "User name is required.";
  if (!isCampusEmail(user.email)) return "A valid campus email is required.";
  if (!validRoles.has(user.role)) return "A valid user role is required.";
  if (!validAuthProviders.has(user.authProvider)) return "A valid auth provider is required.";
  if (user.authProvider === "password" && !user.password) return "Password account is missing credentials.";
  return "";
}

function getRequestCreationGuardError(requestRecord) {
  if (!requestRecord?.id) return "Order id is required.";
  if (!requestRecord.userId) return "Order user is required.";
  if (!requestRecord.serviceType) return "Order service type is required.";
  if (!requestRecord.pickup) return "Pickup is required.";
  if (!requestRecord.time) return "Delivery time is required.";
  if (!requestRecord.payment) return "Delivery fee is required.";

  if (requestRecord.serviceType === "food") {
    if (!requestRecord.destination) return "Delivery destination is required for food orders.";
    if (!requestRecord.deliveryLocationId) return "Delivery location is required for food orders.";
  }

  return "";
}

async function ensureSeedData() {
  await dataRepository.ensureSeedData();
}

async function reserveIdempotencyKey({ userId, key, fingerprint }) {
  if (!key) {
    logBackendEvent("idempotency.missing_key", {
      userId,
    });
    return { reserved: false };
  }

  const record = {
    userId,
    key,
    fingerprint,
    status: "pending",
    createdAt: new Date(),
    expiresAt: createIdempotencyExpiry(),
  };

  const result = await dataRepository.reserveIdempotencyRecord(record);
  if (result.reserved) {
    logBackendEvent("idempotency.reserved", {
      userId,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(key),
      fingerprint,
      expiresAt: record.expiresAt.toISOString(),
    });
    return { reserved: true, record };
  }

  logBackendEvent("idempotency.reused", {
    userId,
    idempotencyKeyRef: getSafeIdempotencyKeyRef(key),
    existingStatus: result.record?.status || "missing",
    fingerprintMatches: result.record?.fingerprint ? result.record.fingerprint === fingerprint : null,
  });
  return result;
}

async function waitForCompletedIdempotencyRecord(userId, key) {
  const deadline = Date.now() + 2500;

  while (Date.now() < deadline) {
    const record = await dataRepository.findIdempotencyRecord(userId, key);
    if (record?.status === "completed") {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return await dataRepository.findIdempotencyRecord(userId, key);
}

async function completeIdempotencyKey({ userId, key, statusCode, payload }) {
  if (!key) {
    return;
  }

  await dataRepository.completeIdempotencyRecord({ userId, key, statusCode, payload });
}

async function acquireOrderCreationLock(userId) {
  const deadline = Date.now() + 2500;

  while (Date.now() < deadline) {
    try {
      return await dataRepository.acquireOrderCreationLock(userId, new Date(Date.now() + ORDER_CREATION_LOCK_TTL_MS));
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return false;
}

async function releaseOrderCreationLock(userId) {
  await dataRepository.releaseOrderCreationLock(userId);
}

function sendJson(requestOrResponse, responseOrStatusCode, statusCodeOrPayload, payloadOrHeaders, maybeHeaders = {}) {
  const hasRequest = typeof requestOrResponse?.method === "string";
  const request = hasRequest ? requestOrResponse : { headers: {}, socket: {} };
  const response = hasRequest ? responseOrStatusCode : requestOrResponse;
  const statusCode = hasRequest ? statusCodeOrPayload : responseOrStatusCode;
  const payload = hasRequest ? payloadOrHeaders : statusCodeOrPayload;
  const extraHeaders = hasRequest ? maybeHeaders : payloadOrHeaders || {};

  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...buildSecurityHeaders(request),
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    authProvider: user.authProvider === "outlook" ? "outlook" : "password",
    role: user.role,
    courierMode: user.courierMode,
    ualbanyIdUploaded: Boolean(user.ualbanyIdUploaded),
    ualbanyIdImage: user.ualbanyIdImage || "",
    foodSafetyVerified: Boolean(user.foodSafetyVerified),
    notificationsEnabled: Boolean(user.notificationsEnabled),
    courierOnline: Boolean(user.courierOnline),
    suspended: Boolean(user.suspended),
    suspendedReason: typeof user.suspendedReason === "string" ? user.suspendedReason : "",
    bio: user.bio,
    rating: user.rating,
    completedJobs: user.completedJobs,
    earnings: user.earnings,
  };
}

function getToken(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7);
  }
  return "";
}

async function requireUser(request, response) {
  const token = getToken(request);
  if (!token) {
    logBackendEvent("session.missing", {
      path: request.url || "",
    });
    sendJson(request, response, 401, { error: "Missing session token." });
    return null;
  }

  const session = await dataRepository.findSessionByToken(token);

  if (!session || isExpiredSession(session)) {
    if (session) {
      await dataRepository.deleteSessionByToken(token);
      logBackendEvent("session.expired", {
        userId: session.userId,
        expiredAt: session.expiresAt,
        path: request.url || "",
      });
    } else {
      logBackendEvent("session.invalid", {
        path: request.url || "",
      });
    }
    sendJson(request, response, 401, { error: "Session expired. Please log in again." });
    return null;
  }

  const data = await readData();
  const user = data.users.find((entry) => entry.id === session.userId);
  if (!user) {
    await dataRepository.deleteSessionByToken(token);
    logBackendEvent("session.orphaned", {
      userId: session.userId,
      path: request.url || "",
    });
    sendJson(request, response, 401, { error: "User not found." });
    return null;
  }

  if (user.suspended) {
    logBackendEvent("session.suspended_user", {
      userId: user.id,
      path: request.url || "",
    });
    sendJson(request, response, 403, {
      error: user.suspendedReason
        ? `This account is suspended: ${user.suspendedReason}`
        : "This account is suspended.",
    });
    return null;
  }

  const url = new URL(request.url || "/", "http://127.0.0.1:4174");
  if (!checkAuthenticatedRateLimit(request, response, url, user.id)) {
    return null;
  }

  return { data, user };
}

function checkAuthenticatedRateLimit(request, response, url, userId) {
  const rateLimit = checkUserRateLimit(request, url, userId);
  if (rateLimit.allowed) return true;

  sendJson(request, response, 429, { error: "Too many requests. Please slow down and try again." }, {
    "Retry-After": String(rateLimit.retryAfterSeconds),
  });
  return false;
}

async function readBody(request, limitBytes = 256 * 1024) {
  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > limitBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(request, response, 404, { error: "Missing URL." });
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1:4174");

    if (request.method === "OPTIONS") {
      sendJson(request, response, 200, { ok: true });
      return;
    }

    const anonymousRateLimit = checkAnonymousRateLimit(request, url);
    if (!anonymousRateLimit.allowed) {
      sendJson(request, response, 429, { error: "Too many requests. Please slow down and try again." }, {
        "Retry-After": String(anonymousRateLimit.retryAfterSeconds),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(request, response, 200, { ok: true, backend: "mongodb" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await readBody(request, getBodyLimitForRequest(request, url));
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      const role = body.role === "courier" ? "courier" : "requester";
      const imageResult = validateDataImage(body.ualbanyIdImage, {
        required: role === "courier",
        maxBytes: 3 * 1024 * 1024,
      });
      const ualbanyIdImage = imageResult.ok ? imageResult.value : "";

      if (!name || !email || !phone || !password) {
        sendJson(request, response, 400, { error: "Name, phone, email, and password are required." });
        return;
      }

      if (!imageResult.ok) {
        sendJson(request, response, 400, { error: imageResult.error });
        return;
      }

      if (!isCampusEmail(email)) {
        sendJson(request, response, 400, { error: "Only .edu email addresses are allowed." });
        return;
      }

      if (password.length < 8) {
        sendJson(request, response, 400, { error: "Password must be at least 8 characters." });
        return;
      }

      if (role === "courier" && !ualbanyIdImage) {
        sendJson(request, response, 400, { error: "Courier accounts need a UAlbany ID photo." });
        return;
      }

      const existingUser = await dataRepository.findUserByEmail(email);
      if (existingUser) {
        logBackendEvent("user.create.rejected", {
          reason: "duplicate_email",
          source: "signup",
          email,
          existingUserId: existingUser.id,
        });
        sendJson(request, response, 409, { error: "That email is already registered." });
        return;
      }

      const user = {
        id: `user-${crypto.randomUUID()}`,
        name,
        email,
        phone,
        password: hashPassword(password),
        authProvider: "password",
        role,
        courierMode: role === "courier",
        ualbanyIdUploaded: Boolean(ualbanyIdImage),
        ualbanyIdImage,
        foodSafetyVerified: false,
        notificationsEnabled: false,
        courierOnline: false,
        bio: "New UAlbany student account.",
        rating: 5,
        completedJobs: 0,
        earnings: 0,
      };

      const userCreationError = getUserCreationGuardError(user);
      if (userCreationError) {
        logBackendEvent("user.create.rejected", {
          reason: userCreationError,
          source: "signup",
          email: user.email,
          userId: user.id,
        });
        sendJson(request, response, 400, { error: userCreationError });
        return;
      }

      try {
        await dataRepository.insertUser(user);
      } catch (error) {
        const duplicateMessage = getDuplicateKeyErrorMessage(error);
        if (duplicateMessage) {
          logBackendEvent("user.create.rejected", {
            reason: "duplicate_key",
            source: "signup",
            email: user.email,
            userId: user.id,
          });
          sendJson(request, response, 409, { error: duplicateMessage });
          return;
        }
        throw error;
      }
      const session = await replaceUserSessionAtomic(user.id);
      sendJson(request, response, 201, { token: session.token, user: sanitizeUser(user) });
      logBackendEvent("user.created", {
        userId: user.id,
        email: user.email,
        role: user.role,
        source: "signup",
      });
      logBackendEvent("user.signup", {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/outlook") {
      const body = await readBody(request, getBodyLimitForRequest(request, url));
      const idToken = String(body.idToken || "").trim();
      const phone = String(body.phone || "").trim();
      const role = body.role === "courier" ? "courier" : "requester";
      const imageResult = validateDataImage(body.ualbanyIdImage, {
        required: role === "courier",
        maxBytes: 3 * 1024 * 1024,
      });
      const ualbanyIdImage = imageResult.ok ? imageResult.value : "";

      if (!idToken) {
        sendJson(request, response, 400, { error: "Microsoft ID token is required." });
        return;
      }

      if (!imageResult.ok) {
        sendJson(request, response, 400, { error: imageResult.error });
        return;
      }

      const microsoftUser = await verifyMicrosoftIdToken(idToken);
      const { email, name } = microsoftUser;

      let user = await dataRepository.findUserByEmail(email);

      if (user) {
        logBackendEvent("user.create.reused", {
          userId: user.id,
          email: user.email,
          source: "outlook",
        });
        const updates = {
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
          authProvider: "outlook",
        };
        if (role === "courier") {
          updates.role = "courier";
          updates.courierMode = true;
          if (ualbanyIdImage) {
            updates.ualbanyIdImage = ualbanyIdImage;
            updates.ualbanyIdUploaded = true;
          }
        }
        await dataRepository.updateUserById(user.id, updates);
        user = { ...user, ...updates };
      } else {
        if (role === "courier" && !ualbanyIdImage) {
          sendJson(request, response, 400, { error: "Courier accounts need a UAlbany ID photo." });
          return;
        }

        user = {
          id: `user-${crypto.randomUUID()}`,
          name,
          email,
          phone,
          password: "",
          authProvider: "outlook",
          role,
          courierMode: role === "courier",
          ualbanyIdUploaded: Boolean(ualbanyIdImage),
          ualbanyIdImage,
          foodSafetyVerified: false,
          notificationsEnabled: false,
          courierOnline: false,
          bio: "New UAlbany Outlook account.",
          rating: 5,
          completedJobs: 0,
          earnings: 0,
        };
        const userCreationError = getUserCreationGuardError(user);
        if (userCreationError) {
          logBackendEvent("user.create.rejected", {
            reason: userCreationError,
            source: "outlook",
            email: user.email,
            userId: user.id,
          });
          sendJson(request, response, 400, { error: userCreationError });
          return;
        }

        try {
          await dataRepository.insertUser(user);
        } catch (error) {
          const duplicateMessage = getDuplicateKeyErrorMessage(error);
          if (duplicateMessage) {
            logBackendEvent("user.create.rejected", {
              reason: "duplicate_key",
              source: "outlook",
              email: user.email,
              userId: user.id,
            });
            sendJson(request, response, 409, { error: duplicateMessage });
            return;
          }
          throw error;
        }
        logBackendEvent("user.created", {
          userId: user.id,
          email: user.email,
          role: user.role,
          source: "outlook",
        });
      }

      const session = await replaceUserSessionAtomic(user.id);
      sendJson(request, response, 200, { token: session.token, user: sanitizeUser(user) });
      logBackendEvent("user.login", {
        userId: user.id,
        email: user.email,
        role: user.role,
        method: "outlook",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(request, getBodyLimitForRequest(request, url));
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = await dataRepository.findUserByEmail(email);

      if (user?.authProvider === "outlook") {
        sendJson(request, response, 400, { error: "This account uses Outlook. Use the Outlook button to continue." });
        return;
      }
      if (!user || !verifyPassword(password, user.password)) {
        sendJson(request, response, 401, { error: "Invalid email or password." });
        return;
      }

      const session = await replaceUserSessionAtomic(user.id);
      sendJson(request, response, 200, { token: session.token, user: sanitizeUser(user) });
      logBackendEvent("user.login", {
        userId: user.id,
        email: user.email,
        role: user.role,
        method: "password",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = getToken(request);
      if (token) {
        const existingSession = await dataRepository.findSessionByToken(token);
        await dataRepository.deleteSessionByToken(token);
        logBackendEvent("user.logout", {
          userId: existingSession?.userId || "",
          sessionFound: Boolean(existingSession),
        });
      } else {
        logBackendEvent("user.logout", {
          userId: "",
          sessionFound: false,
        });
      }

      sendJson(request, response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const auth = await requireUser(request, response);
      if (!auth) return;
      sendJson(request, response, 200, { user: sanitizeUser(auth.user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const auth = await requireUser(request, response);
      if (!auth) return;
      sendJson(request, response, 200, {
        user: sanitizeUser(auth.user),
        restaurants: auth.data.restaurants,
        deliveryLocations: DELIVERY_LOCATIONS,
        requests: auth.data.requests.map((entry) => decorateRequest(entry, auth.data)),
        campusSnapshot: getCampusSnapshot(auth.data, auth.user.id),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/requests") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const mode = url.searchParams.get("mode") || "all";
      let filtered = auth.data.requests;

      if (mode === "mine") {
        filtered = filtered.filter((entry) => entry.userId === auth.user.id);
      }

      if (mode === "courier") {
        filtered = filtered.filter((entry) => entry.status === "open" || entry.acceptedBy === auth.user.id);
      }

      sendJson(request, response, 200, {
        requests: filtered
          .filter((entry) => entry.moderationStatus !== "removed")
          .slice()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map((entry) => decorateRequest(entry, auth.data)),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const body = await readBody(request, getBodyLimitForRequest(request, url));
      const startCheckout = body.startCheckout === true;
      const serviceType = String(body.serviceType || "food");
      const deliveryPricing = serviceType === "food" ? getDeliveryPricingForLocation(body.deliveryLocationId) : null;
      const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
      const idempotencyFingerprint = createRequestFingerprint(body);
      logBackendEvent("order.create.attempt", {
        userId: auth.user.id,
        serviceType,
        pickup: String(body.pickup || "").trim(),
        destination: String(body.destination || "").trim(),
        deliveryLocationId: String(body.deliveryLocationId || "").trim(),
        idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        fingerprint: idempotencyFingerprint,
        startCheckout,
      });

      if (deliveryPricing && !deliveryPricing.ok) {
        logBackendEvent("order.create.rejected", {
          userId: auth.user.id,
          reason: deliveryPricing.error,
          deliveryLocationId: String(body.deliveryLocationId || "").trim(),
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 400, { error: deliveryPricing.error });
        return;
      }

      const tipResult = parseOptionalTip(body.tipAmount);
      if (!tipResult.ok) {
        logBackendEvent("order.create.rejected", {
          userId: auth.user.id,
          reason: "invalid_tip",
          tipAmount: body.tipAmount,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 400, { error: tipResult.error });
        return;
      }

      const basePayment = deliveryPricing?.fee ?? MIN_PAYMENT_OFFER;
      const paymentTotal = buildPaymentTotal(basePayment, tipResult.amount);

      const screenshotResult = validateDataImage(body.orderScreenshot, {
        required: false,
        maxBytes: 2 * 1024 * 1024,
      });
      if (!screenshotResult.ok) {
        sendJson(request, response, 400, { error: screenshotResult.error });
        return;
      }

      const requestRecord = {
        id: `request-${crypto.randomUUID()}`,
        userId: auth.user.id,
        requesterName: auth.user.name,
        serviceType,
        pickup: truncateText(body.pickup, 120),
        destination: truncateText(body.destination, 180),
        time: truncateText(body.time, 80),
        payment: formatPaymentAmount(paymentTotal),
        basePayment,
        tipAmount: tipResult.amount,
        deliveryLocationId: deliveryPricing?.id ?? "",
        deliveryLocationLabel: deliveryPricing?.label ?? "",
        notes: truncateText(body.notes, 1000),
        orderEta: truncateText(body.orderEta, 120),
        foodReady: false,
        foodReadyAt: "",
        completedAt: "",
        cancelledAt: "",
        expiredAt: "",
        closedBy: "",
        orderScreenshot: screenshotResult.value,
        estimatedRetailTotal: Number.isFinite(Number(body.estimatedRetailTotal)) ? Number(body.estimatedRetailTotal) : null,
        estimatedDiscountCost: null,
        runnerEarnings: null,
        paymentStatus: "unpaid",
        paidAt: "",
        stripeCheckoutSessionId: "",
        status: "open",
        acceptedBy: null,
        flagged: false,
        flaggedReason: "",
        moderationStatus: "clear",
        removedAt: "",
        removedBy: "",
        createdAt: new Date().toISOString(),
      };

      if (!requestRecord.pickup || !requestRecord.time || !requestRecord.payment) {
        logBackendEvent("order.create.rejected", {
          userId: auth.user.id,
          reason: "missing_required_fields",
          requestId: requestRecord.id,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 400, { error: "Pickup, time, and delivery fee are required." });
        return;
      }

      if (requestRecord.serviceType === "food" && !requestRecord.destination) {
        logBackendEvent("order.create.rejected", {
          userId: auth.user.id,
          reason: "missing_destination",
          requestId: requestRecord.id,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 400, { error: "Delivery destination is required for food orders." });
        return;
      }

      const paymentAmount = Number.parseFloat(requestRecord.payment);
      if (!Number.isFinite(paymentAmount) || paymentAmount < MIN_PAYMENT_OFFER) {
        logBackendEvent("order.create.rejected", {
          userId: auth.user.id,
          reason: "invalid_payment",
          requestId: requestRecord.id,
          payment: requestRecord.payment,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 400, { error: `Payment offers must be at least $${MIN_PAYMENT_OFFER}.` });
        return;
      }

      if (requestRecord.serviceType === "discount") {
        if (!Number.isFinite(requestRecord.estimatedRetailTotal)) {
          logBackendEvent("order.create.rejected", {
            userId: auth.user.id,
            reason: "missing_estimated_retail_total",
            requestId: requestRecord.id,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
          });
          sendJson(request, response, 400, { error: "Estimated retail total is required for discount dollar runs." });
          return;
        }

        requestRecord.estimatedDiscountCost = Number((requestRecord.estimatedRetailTotal * (1 - DISCOUNT_RATE)).toFixed(2));
        requestRecord.runnerEarnings = Number((paymentAmount - requestRecord.estimatedDiscountCost).toFixed(2));

        if (requestRecord.runnerEarnings <= 0) {
          logBackendEvent("order.create.rejected", {
            userId: auth.user.id,
            reason: "invalid_runner_earnings",
            requestId: requestRecord.id,
            payment: requestRecord.payment,
            estimatedDiscountCost: requestRecord.estimatedDiscountCost,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
          });
          sendJson(request, response, 400, { error: "Platform payment must leave room for the runner to earn money." });
          return;
        }
      }

      const requestCreationError = getRequestCreationGuardError(requestRecord);
      if (requestCreationError) {
        logBackendEvent("order.create.rejected", {
          userId: auth.user.id,
          reason: requestCreationError,
          requestId: requestRecord.id,
          serviceType: requestRecord.serviceType,
          deliveryLocationId: requestRecord.deliveryLocationId,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 400, { error: requestCreationError });
        return;
      }

      const idempotencyReservation = await reserveIdempotencyKey({
        userId: auth.user.id,
        key: idempotencyKey,
        fingerprint: idempotencyFingerprint,
      });

      if (idempotencyKey && !idempotencyReservation.reserved) {
        const existingRecord =
          idempotencyReservation.record?.status === "completed"
            ? idempotencyReservation.record
            : await waitForCompletedIdempotencyRecord(auth.user.id, idempotencyKey);

        if (existingRecord?.fingerprint && existingRecord.fingerprint !== idempotencyFingerprint) {
          logBackendEvent("duplicate_prevention.idempotency_conflict", {
            userId: auth.user.id,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
            incomingFingerprint: idempotencyFingerprint,
            existingFingerprint: existingRecord.fingerprint,
          });
          sendJson(request, response, 409, { error: "This request key was already used for a different order." });
          return;
        }

        if (existingRecord?.status === "completed" && existingRecord.responsePayload) {
          logBackendEvent("duplicate_prevention.idempotency_replay", {
            userId: auth.user.id,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
            responseStatus: existingRecord.responseStatus || 200,
            requestId: existingRecord.responsePayload?.request?.id || "",
          });
          sendJson(request, response, existingRecord.responseStatus || 200, existingRecord.responsePayload);
          return;
        }

        logBackendEvent("duplicate_prevention.idempotency_pending", {
          userId: auth.user.id,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
          existingStatus: existingRecord?.status || "missing",
        });
        sendJson(request, response, 409, { error: "This order is already being processed. Please wait a moment." });
        return;
      }

      const lockAcquired = await acquireOrderCreationLock(auth.user.id);
      if (!lockAcquired) {
        await dataRepository.deleteIdempotencyRecord(auth.user.id, idempotencyKey);
        logBackendEvent("duplicate_prevention.order_lock_timeout", {
          userId: auth.user.id,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
        });
        sendJson(request, response, 409, { error: "Another order is already being created. Please try again." });
        return;
      }

      try {
        applyAutomaticModeration(requestRecord);

        const duplicateCandidates = await dataRepository.findActiveRequestsByUser(auth.user.id);
        const duplicateRequest =
          findRecentDuplicateRequest(duplicateCandidates, requestRecord) ||
          findRecentSimilarSubmission(duplicateCandidates, requestRecord);
        if (duplicateRequest) {
          const payload = {
            duplicate: true,
            request: decorateRequest(duplicateRequest, auth.data),
          };
          logBackendEvent("duplicate_prevention.recent_duplicate", {
            userId: auth.user.id,
            incomingRequestId: requestRecord.id,
            existingRequestId: duplicateRequest.id,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
            fingerprint: idempotencyFingerprint,
          });
          await completeIdempotencyKey({
            userId: auth.user.id,
            key: idempotencyKey,
            statusCode: 200,
            payload,
          });
          sendJson(request, response, 200, payload);
          return;
        }

        const activeRequestCount = await dataRepository.countActiveRequestsByUser(auth.user.id);

        if (activeRequestCount >= MAX_ACTIVE_REQUESTS_PER_USER) {
          const payload = {
            error: `You can only have ${MAX_ACTIVE_REQUESTS_PER_USER} active orders at a time.`,
          };
          logBackendEvent("duplicate_prevention.active_limit", {
            userId: auth.user.id,
            activeRequestCount,
            maxActiveRequests: MAX_ACTIVE_REQUESTS_PER_USER,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
          });
          await completeIdempotencyKey({
            userId: auth.user.id,
            key: idempotencyKey,
            statusCode: 400,
            payload,
          });
          sendJson(request, response, 400, payload);
          return;
        }

        await dataRepository.insertRequest(requestRecord);
        const messages = [
          {
            id: `message-${crypto.randomUUID()}`,
            senderId: auth.user.id,
            senderName: auth.user.name,
            text:
              requestRecord.serviceType === "food"
                ? `Food delivery request posted for ${requestRecord.pickup}.`
                : "Request posted successfully.",
            createdAt: new Date().toISOString(),
          },
        ];

        if (startCheckout) {
          const amountNumber = Math.round(Number.parseFloat(requestRecord.payment) * 100);

          if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
            await dataRepository.deleteIdempotencyRecord(auth.user.id, idempotencyKey);
            await dataRepository.deleteRequestById(requestRecord.id);
            sendJson(request, response, 400, { error: "Request payment amount is invalid." });
            return;
          }

          const session = await createStripeCheckoutSession({
            amount: amountNumber,
            requestId: requestRecord.id,
            requesterEmail: auth.user.email,
            description: `${requestRecord.pickup} to ${requestRecord.destination || "campus drop-off"}`,
            request,
          });

          requestRecord.paymentStatus = "pending";
          requestRecord.stripeCheckoutSessionId = String(session.id || "");
          messages.push({
            id: `message-${crypto.randomUUID()}`,
            senderId: auth.user.id,
            senderName: auth.user.name,
            text: "Stripe Checkout started for this request.",
            createdAt: new Date().toISOString(),
          });
          await dataRepository.updateRequestById(requestRecord.id, {
            paymentStatus: requestRecord.paymentStatus,
            stripeCheckoutSessionId: requestRecord.stripeCheckoutSessionId,
          });
          await dataRepository.insertMessages(requestRecord.id, messages);
          const payload = { request: decorateRequest(requestRecord, auth.data), checkoutUrl: session.url };
          await completeIdempotencyKey({
            userId: auth.user.id,
            key: idempotencyKey,
            statusCode: 201,
            payload,
          });
          logBackendEvent("order.create.success", {
            userId: auth.user.id,
            requestId: requestRecord.id,
            serviceType: requestRecord.serviceType,
            deliveryLocationId: requestRecord.deliveryLocationId,
            payment: requestRecord.payment,
            paymentStatus: requestRecord.paymentStatus,
            idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
            startCheckout,
          });
          sendJson(request, response, 201, payload);
          return;
        }

        await dataRepository.insertMessages(requestRecord.id, messages);
        const payload = { request: decorateRequest(requestRecord, auth.data) };
        await completeIdempotencyKey({
          userId: auth.user.id,
          key: idempotencyKey,
          statusCode: 201,
          payload,
        });
        logBackendEvent("order.create.success", {
          userId: auth.user.id,
          requestId: requestRecord.id,
          serviceType: requestRecord.serviceType,
          deliveryLocationId: requestRecord.deliveryLocationId,
          payment: requestRecord.payment,
          paymentStatus: requestRecord.paymentStatus,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
          startCheckout,
        });
        sendJson(request, response, 201, payload);
        return;
      } catch (error) {
        await dataRepository.deleteIdempotencyRecord(auth.user.id, idempotencyKey);
        await dataRepository.deleteRequestById(requestRecord.id);
        await dataRepository.deleteMessagesByRequestId(requestRecord.id);
        logBackendEvent("order.create.failed", {
          userId: auth.user.id,
          requestId: requestRecord.id,
          idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        await releaseOrderCreationLock(auth.user.id);
      }
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/accept")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(request, response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(request, response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (requestRecord.serviceType === "food" && !auth.user.foodSafetyVerified) {
        sendJson(request, response, 403, { error: "Verify your campus email before accepting food deliveries." });
        return;
      }

      if (requestRecord.userId === auth.user.id) {
        sendJson(request, response, 400, { error: "You cannot accept your own request." });
        return;
      }

      if (requestRecord.status === "accepted" && requestRecord.acceptedBy && requestRecord.acceptedBy !== auth.user.id) {
        sendJson(request, response, 409, { error: "This request was already accepted by another courier." });
        return;
      }

      if (requestRecord.status !== "open" && requestRecord.acceptedBy !== auth.user.id) {
        sendJson(request, response, 400, { error: "This request is no longer open." });
        return;
      }

      requestRecord.status = "accepted";
      requestRecord.acceptedBy = auth.user.id;
      auth.data.messages[requestId] = auth.data.messages[requestId] || [];
      auth.data.messages[requestId].push({
        id: `message-${crypto.randomUUID()}`,
        senderId: auth.user.id,
        senderName: auth.user.name,
        text: `${auth.user.name} accepted this request and is heading to pickup.`,
        createdAt: new Date().toISOString(),
      });
      await writeData(auth.data);
      sendJson(request, response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/ready")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(request, response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(request, response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (requestRecord.userId !== auth.user.id) {
        sendJson(request, response, 403, { error: "Only the requester can mark this order as ready." });
        return;
      }

      if (requestRecord.serviceType !== "food") {
        sendJson(request, response, 400, { error: "Only food requests can be marked ready." });
        return;
      }

      requestRecord.foodReady = true;
      requestRecord.foodReadyAt = new Date().toISOString();
      auth.data.messages[requestId] = auth.data.messages[requestId] || [];
      auth.data.messages[requestId].push({
        id: `message-${crypto.randomUUID()}`,
        senderId: auth.user.id,
        senderName: auth.user.name,
        text: "I got the GET email. The food is ready for pickup now.",
        createdAt: new Date().toISOString(),
      });
      await writeData(auth.data);
      sendJson(request, response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/complete")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(request, response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(request, response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (!canAccessRequest(auth.user.id, requestRecord)) {
        sendJson(request, response, 403, { error: "Only the requester or assigned courier can complete this order." });
        return;
      }

      if (requestRecord.status !== "accepted" || !requestRecord.acceptedBy) {
        sendJson(request, response, 400, { error: "Only accepted orders can be completed." });
        return;
      }

      if (requestRecord.paymentStatus !== "paid") {
        sendJson(request, response, 400, { error: "Payment must be completed before this order can be closed." });
        return;
      }

      const now = new Date().toISOString();
      requestRecord.status = "completed";
      requestRecord.completedAt = now;
      requestRecord.closedBy = auth.user.id;

      const courier = auth.data.users.find((entry) => entry.id === requestRecord.acceptedBy);
      if (courier) {
        const earnings =
          requestRecord.serviceType === "discount" && typeof requestRecord.runnerEarnings === "number"
            ? requestRecord.runnerEarnings
            : Number.parseFloat(requestRecord.payment || "0");
        courier.completedJobs = Number(courier.completedJobs || 0) + 1;
        courier.earnings = Number((Number(courier.earnings || 0) + (Number.isFinite(earnings) ? earnings : 0)).toFixed(2));
      }

      auth.data.messages[requestId] = auth.data.messages[requestId] || [];
      auth.data.messages[requestId].push({
        id: `message-${crypto.randomUUID()}`,
        senderId: auth.user.id,
        senderName: auth.user.name,
        text: "Order completed. Thanks for using CampusConnect.",
        createdAt: now,
      });
      await writeData(auth.data);
      sendJson(request, response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/cancel")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(request, response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(request, response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (requestRecord.userId !== auth.user.id) {
        sendJson(request, response, 403, { error: "Only the requester can cancel this order." });
        return;
      }

      if (!isActiveRequestStatus(requestRecord.status)) {
        sendJson(request, response, 400, { error: "This order is already closed." });
        return;
      }

      const now = new Date().toISOString();
      requestRecord.status = "cancelled";
      requestRecord.cancelledAt = now;
      requestRecord.closedBy = auth.user.id;

      auth.data.messages[requestId] = auth.data.messages[requestId] || [];
      auth.data.messages[requestId].push({
        id: `message-${crypto.randomUUID()}`,
        senderId: auth.user.id,
        senderName: auth.user.name,
        text: "The requester cancelled this order.",
        createdAt: now,
      });
      await writeData(auth.data);
      sendJson(request, response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    const routeContext = {
      request,
      response,
      url,
      requireUser,
      sendJson: (routeResponse, statusCode, payload, extraHeaders) =>
        sendJson(request, routeResponse, statusCode, payload, extraHeaders),
      readBody: (routeRequest = request) => readBody(routeRequest, getBodyLimitForRequest(routeRequest, url)),
      writeData,
      sanitizeUser,
      canAccessRequest,
      decorateRequest,
      requireAdmin,
      buildAdminOverview,
      createStripeCheckoutSession,
      getStripeCheckoutSession,
    };

    if (await handleMessagingRoute(routeContext)) return;
    if (await handleRatingsRoute(routeContext)) return;
    if (await handleProfileRoute(routeContext)) return;
    if (await handleAdminRoute(routeContext)) return;
    if (await handlePaymentsRoute(routeContext)) return;

    sendJson(request, response, 404, { error: "Route not found." });
  } catch (error) {
    if (error?.statusCode === 413) {
      sendJson(request, response, 413, { error: "Request body is too large." });
      return;
    }

    if (error instanceof SyntaxError) {
      sendJson(request, response, 400, { error: "Request body must be valid JSON." });
      return;
    }

    console.error("Unhandled backend error", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
    });
    sendJson(request, response, 500, {
      error: "Unexpected server error. Please try again.",
    });
  }
});

await ensureSeedData();
await readData();

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";

server.listen(port, host, () => {
  console.log(`CampusConnect API running at http://${host}:${port} (MongoDB connected)`);
});
