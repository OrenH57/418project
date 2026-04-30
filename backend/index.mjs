// File purpose:
// Lightweight local backend for the CampusConnect prototype.
// Handles auth, requests, messages, profile updates, verification, and optional Stripe checkout.

import http from "node:http";
import path from "node:path";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { dataFile, loadEnv } from "./lib/config.mjs";
import { createToken, hashPassword, isCampusEmail, verifyPassword } from "./lib/auth.mjs";
import { buildAdminOverview, requireAdmin } from "./lib/admin.mjs";
import { canAccessRequest, decorateRequest } from "./lib/requests.mjs";
import { verifyMicrosoftIdToken } from "./lib/microsoftAuth.mjs";
import { createStripeCheckoutSession, getStripeCheckoutSession, verifyStripeWebhookPayload } from "./lib/payments.mjs";
import {
  buildSecurityHeaders,
  createRouteRateLimiter,
  getBodyLimitForRequest,
  validateDataImage,
} from "./lib/security.mjs";
import { createMongoDataAdapter, createTempFileDataAdapter } from "./lib/data/adapters.mjs";
import { createDataRepository } from "./lib/data/repository.mjs";
import { SESSION_TTL_MS, isExpiredSession } from "./lib/data/normalize.mjs";
import {
  handleAdminRoute,
  handleMessagingRoute,
  handlePaymentsRoute,
  handleProfileRoute,
  handleRatingsRoute,
} from "./lib/routeGroups.mjs";
import { handleRequestRoute } from "./routes/requestRoutes.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

await loadEnv();
const mongoUri = process.env.MONGODB_URI;

let storageLabel = "file";
let dataAdapter;

function hasSameIndexSpec(existingIndex, expectedKey, expectedOptions = {}) {
  if (!hasSameIndexKey(existingIndex, expectedKey)) {
    return false;
  }

  if (Boolean(existingIndex.unique) !== Boolean(expectedOptions.unique)) {
    return false;
  }

  if (
    "expireAfterSeconds" in expectedOptions &&
    Number(existingIndex.expireAfterSeconds) !== Number(expectedOptions.expireAfterSeconds)
  ) {
    return false;
  }

  return true;
}

function hasSameIndexKey(existingIndex, expectedKey) {
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

  return true;
}

function getDefaultIndexName(key) {
  return Object.entries(key)
    .map(([field, direction]) => `${field}_${direction}`)
    .join("_");
}

function isRecoverableIndexError(error) {
  if (!(error && typeof error === "object" && "code" in error)) {
    return false;
  }

  const isIndexBuildError = error.message?.includes("Index build failed") || error.message?.includes("E11000");
  return error.code === 85 || error.code === 86 || (error.code === 11000 && isIndexBuildError);
}

function warnIndexSkipped(collection, key, options, error) {
  console.warn("MongoDB index setup warning; continuing without this index.", {
    collection: collection.collectionName,
    key,
    options,
    code: error?.code,
    codeName: error?.codeName,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function ensureIndex(collection, key, options = {}) {
  try {
    await collection.createIndex(key, options);
  } catch (error) {
    // 85/86 are stale index conflicts. 11000 can happen when existing data violates
    // a unique index being created. None of those should prevent the demo server
    // from starting; the app still guards duplicates in application code.
    if (isRecoverableIndexError(error)) {
      try {
        const indexes = await collection.listIndexes().toArray();
        const alreadyCovered = indexes.some((entry) => hasSameIndexSpec(entry, key, options));

        if (alreadyCovered) {
          return;
        }

        const requestedName = options.name || getDefaultIndexName(key);
        const conflictingIndex = indexes.find((entry) => entry.name === requestedName);
        if (conflictingIndex && hasSameIndexKey(conflictingIndex, key)) {
          await collection.dropIndex(conflictingIndex.name);
          await collection.createIndex(key, options);
          return;
        }
      } catch (repairError) {
        warnIndexSkipped(collection, key, options, repairError);
        return;
      }

      warnIndexSkipped(collection, key, options, error);
      return;
    }

    throw error;
  }
}

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

if (mongoUri) {
  try {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    dataAdapter = createMongoDataAdapter(client.db("campusconnect"), { ensureIndex });
    storageLabel = "mongodb";
  } catch (error) {
    console.warn("MongoDB unavailable; falling back to local file storage.", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
} else {
  console.warn("MONGODB_URI is missing; using local file storage.");
}

if (!dataAdapter) {
  dataAdapter = createTempFileDataAdapter({ dataFile });
}

const dataRepository = createDataRepository(
  dataAdapter,
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

async function ensureSeedData() {
  await dataRepository.ensureSeedData();
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

async function readRawBody(request, limitBytes = 256 * 1024) {
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

  return Buffer.concat(chunks).toString("utf8");
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
      sendJson(request, response, 200, { ok: true, backend: storageLabel });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/webhook") {
      const rawBody = await readRawBody(request, getBodyLimitForRequest(request, url));
      let event;

      try {
        event = verifyStripeWebhookPayload(rawBody, request.headers["stripe-signature"] || "");
      } catch (error) {
        logBackendEvent("stripe.webhook.rejected", {
          reason: error instanceof Error ? error.message : String(error),
        });
        sendJson(request, response, 400, { error: "Invalid Stripe webhook." });
        return;
      }

      if (event?.type === "checkout.session.completed") {
        const checkoutSessionId = String(event.data?.object?.id || "");
        const paymentStatus = String(event.data?.object?.payment_status || "");

        if (checkoutSessionId && paymentStatus === "paid") {
          const paidAt = new Date().toISOString();
          const result = await dataRepository.markRequestPaidByCheckoutSession(checkoutSessionId, {
            paymentStatus: "paid",
            paidAt,
          });

          if (result.modifiedCount && result.request) {
            await dataRepository.appendMessage(result.request.id, {
              id: `message-${crypto.randomUUID()}`,
              senderId: "system",
              senderName: "CampusConnect",
              text: "Payment was completed in Stripe Checkout.",
              createdAt: paidAt,
            });
          }

          logBackendEvent("stripe.webhook.checkout_completed", {
            checkoutSessionId,
            requestId: result.request?.id || "",
            updated: Boolean(result.modifiedCount),
          });
        }
      }

      sendJson(request, response, 200, { received: true });
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

    const routeContext = {
      request,
      response,
      url,
      requireUser,
      sendJson: (routeResponse, statusCode, payload, extraHeaders) =>
        sendJson(request, routeResponse, statusCode, payload, extraHeaders),
      readBody: (routeRequest = request) => readBody(routeRequest, getBodyLimitForRequest(routeRequest, url)),
      writeData,
      dataRepository,
      readData,
      logBackendEvent,
      sanitizeUser,
      canAccessRequest,
      decorateRequest,
      requireAdmin,
      buildAdminOverview,
      createStripeCheckoutSession,
      getStripeCheckoutSession,
    };

    if (await handleRequestRoute(routeContext)) return;
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
  console.log(`CampusConnect API running at http://${host}:${port} (${storageLabel} storage)`);
});
