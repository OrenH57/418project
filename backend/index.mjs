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
  ualbanyRestaurants,
} from "./lib/config.mjs";
import { createToken, hashPassword, isCampusEmail, verifyPassword } from "./lib/auth.mjs";
import { buildAdminOverview, applyAutomaticModeration, blockedRequestKeywords, requireAdmin } from "./lib/admin.mjs";
import {
  canAccessRequest,
  decorateRequest,
  findRecentDuplicateRequest,
  getCampusSnapshot,
} from "./lib/requests.mjs";
import { verifyMicrosoftIdToken } from "./lib/microsoftAuth.mjs";
import { createStripeCheckoutSession, getStripeCheckoutSession } from "./lib/payments.mjs";
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

const usersCollection = db.collection("users");
const sessionsCollection = db.collection("sessions");
const requestsCollection = db.collection("requests");
const ratingsCollection = db.collection("ratings");
const messagesCollection = db.collection("messages");

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

await ensureIndex(requestsCollection, { id: 1 }, { unique: true });
await ensureIndex(messagesCollection, { requestId: 1 }, { unique: true });
const MAX_ACTIVE_REQUESTS_PER_USER = 3;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const seedData = {
  users: [
    {
      id: "user-requester-1",
      name: "Ariana Green",
      email: "ariana.green@albany.edu",
      phone: "518-555-0141",
      password: hashPassword("demo1234"),
      authProvider: "password",
      role: "requester",
      courierMode: false,
      ualbanyIdUploaded: false,
      ualbanyIdImage: "",
      foodSafetyVerified: false,
      notificationsEnabled: false,
      courierOnline: false,
      bio: "Student who orders from the dorm, library, or a late-night study session when leaving campus spots is a hassle.",
      rating: 4.8,
      completedJobs: 12,
      earnings: 0,
    },
    {
      id: "user-courier-1",
      name: "Marcus Hall",
      email: "marcus.hall@albany.edu",
      phone: "518-555-0188",
      password: hashPassword("demo1234"),
      authProvider: "password",
      role: "courier",
      courierMode: true,
      ualbanyIdUploaded: true,
      ualbanyIdImage: "demo-ualbany-id-on-file",
      foodSafetyVerified: true,
      notificationsEnabled: true,
      courierOnline: true,
      bio: "Student courier covering dorms, libraries, and late-night campus runs when weather or darkness makes walking less appealing.",
      rating: 4.9,
      completedJobs: 34,
      earnings: 186,
    },
    {
      id: "user-admin-1",
      name: "Jordan Reyes",
      email: "jordan.reyes@albany.edu",
      phone: "518-555-0112",
      password: hashPassword("demo1234"),
      authProvider: "password",
      role: "admin",
      courierMode: false,
      ualbanyIdUploaded: true,
      ualbanyIdImage: "demo-admin-id-on-file",
      foodSafetyVerified: true,
      notificationsEnabled: true,
      courierOnline: false,
      suspended: false,
      suspendedReason: "",
      bio: "CampusConnect admin keeping delivery requests safe and campus-only.",
      rating: 5,
      completedJobs: 0,
      earnings: 0,
    },
  ],
  sessions: [],
  requests: [
    {
      id: "request-1",
      userId: "user-requester-1",
      requesterName: "Ariana Green",
      serviceType: "food",
      pickup: "Baba's Pizza",
      destination: "Eastman Tower lobby",
      time: "Today, 6:15 PM",
      payment: "7",
      notes: "Personal pizza and drink under Ariana. Please text when you leave the campus center.",
      status: "open",
      acceptedBy: null,
      createdAt: "2026-04-22T17:00:00.000Z",
    },
    {
      id: "request-2",
      userId: "user-requester-1",
      requesterName: "Ariana Green",
      serviceType: "food",
      pickup: "The Halal Shack",
      destination: "State Quad fountain",
      time: "Today, 7:00 PM",
      payment: "6",
      notes: "Chicken and rice, no onions.",
      status: "open",
      acceptedBy: null,
      createdAt: "2026-04-22T17:10:00.000Z",
    },
  ],
  messages: {
    "request-1": [
      {
        id: "message-1",
        senderId: "user-requester-1",
        senderName: "Ariana Green",
        text: "Order is already placed, just need the pickup run.",
        createdAt: "2026-04-22T17:02:00.000Z",
      },
    ],
  },
  restaurants: ualbanyRestaurants,
};

const demoUsers = seedData.users.map((user) => ({
  ...user,
}));
const demoUserByEmail = new Map(demoUsers.map((user) => [user.email.toLowerCase(), user]));

function createSessionRecord(userId) {
  const createdAt = new Date();

  return {
    token: createToken(),
    userId,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString(),
  };
}

function replaceUserSession(data, userId) {
  const session = createSessionRecord(userId);
  data.sessions = (Array.isArray(data.sessions) ? data.sessions : []).filter((entry) => entry.userId !== userId);
  data.sessions.push(session);
  return session;
}

function isExpiredSession(session) {
  if (!session?.expiresAt) {
    return false;
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function normalizeDataRelationships(data) {
  let changed = false;

  if (!Array.isArray(data.users)) {
    data.users = [];
    changed = true;
  }
  if (!Array.isArray(data.sessions)) {
    data.sessions = [];
    changed = true;
  }
  if (!Array.isArray(data.requests)) {
    data.requests = [];
    changed = true;
  }
  if (!Array.isArray(data.ratings)) {
    data.ratings = [];
    changed = true;
  }
  if (!data.messages || typeof data.messages !== "object") {
    data.messages = {};
    changed = true;
  }

  const canonicalUsers = [];
  const userByEmail = new Map();
  const userIdAliases = new Map();

  for (const user of data.users) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) {
      changed = true;
      continue;
    }

    if (user.email !== email) {
      user.email = email;
      changed = true;
    }

    const existing = userByEmail.get(email);
    if (!existing) {
      userByEmail.set(email, user);
      canonicalUsers.push(user);
      userIdAliases.set(user.id, user.id);
      continue;
    }

    const demoUser = demoUserByEmail.get(email);
    const shouldPreferCurrent = demoUser && user.id === demoUser.id && existing.id !== demoUser.id;
    const keptUser = shouldPreferCurrent ? user : existing;
    const droppedUser = shouldPreferCurrent ? existing : user;

    if (shouldPreferCurrent) {
      const existingIndex = canonicalUsers.indexOf(existing);
      canonicalUsers[existingIndex] = user;
      userByEmail.set(email, user);
    }

    userIdAliases.set(droppedUser.id, keptUser.id);
    changed = true;
  }

  if (canonicalUsers.length !== data.users.length) {
    data.users = canonicalUsers;
    changed = true;
  }

  const resolveUserId = (userId) => userIdAliases.get(userId) || userId;

  for (const requestRecord of data.requests) {
    const nextUserId = resolveUserId(requestRecord.userId);
    if (nextUserId !== requestRecord.userId) {
      requestRecord.userId = nextUserId;
      changed = true;
    }
    if (requestRecord.acceptedBy) {
      const nextAcceptedBy = resolveUserId(requestRecord.acceptedBy);
      if (nextAcceptedBy !== requestRecord.acceptedBy) {
        requestRecord.acceptedBy = nextAcceptedBy;
        changed = true;
      }
    }
  }

  for (const rating of data.ratings) {
    const nextAuthorUserId = resolveUserId(rating.authorUserId);
    const nextTargetUserId = resolveUserId(rating.targetUserId);
    if (nextAuthorUserId !== rating.authorUserId) {
      rating.authorUserId = nextAuthorUserId;
      changed = true;
    }
    if (nextTargetUserId !== rating.targetUserId) {
      rating.targetUserId = nextTargetUserId;
      changed = true;
    }
  }

  for (const messages of Object.values(data.messages)) {
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      const nextSenderId = resolveUserId(message.senderId);
      if (nextSenderId !== message.senderId) {
        message.senderId = nextSenderId;
        changed = true;
      }
    }
  }

  const validUserIds = new Set(data.users.map((user) => user.id));
  const seenTokens = new Set();
  const normalizedSessions = [];

  for (const session of data.sessions) {
    if (!session?.token || !validUserIds.has(resolveUserId(session.userId)) || seenTokens.has(session.token)) {
      changed = true;
      continue;
    }

    const nextUserId = resolveUserId(session.userId);
    if (nextUserId !== session.userId) {
      session.userId = nextUserId;
      changed = true;
    }

    if (!session.createdAt) {
      session.createdAt = new Date().toISOString();
      changed = true;
    }
    if (!session.expiresAt) {
      const createdAt = new Date(session.createdAt).getTime();
      const baseTime = Number.isFinite(createdAt) ? createdAt : Date.now();
      session.expiresAt = new Date(baseTime + SESSION_TTL_MS).toISOString();
      changed = true;
    }

    if (isExpiredSession(session)) {
      changed = true;
      continue;
    }

    seenTokens.add(session.token);
    normalizedSessions.push(session);
  }

  if (normalizedSessions.length !== data.sessions.length) {
    data.sessions = normalizedSessions;
    changed = true;
  }

  return changed;
}

async function ensureDemoUsers() {
  for (const user of demoUsers) {
    await usersCollection.updateOne(
      { email: user.email },
      {
        $set: {
          name: user.name,
          phone: user.phone,
          password: user.password,
          authProvider: "password",
          role: user.role,
          courierMode: user.courierMode,
          ualbanyIdUploaded: user.ualbanyIdUploaded,
          ualbanyIdImage: user.ualbanyIdImage,
          foodSafetyVerified: user.foodSafetyVerified,
          notificationsEnabled: user.notificationsEnabled,
          courierOnline: user.courierOnline,
          suspended: user.suspended,
          suspendedReason: user.suspendedReason,
          bio: user.bio,
          rating: user.rating,
          completedJobs: user.completedJobs,
          earnings: user.earnings,
        },
        $setOnInsert: {
          id: user.id,
        },
      },
      { upsert: true },
    );
  }
}

async function ensureSeedData() {
  await ensureDemoUsers();

  const requestCount = await requestsCollection.countDocuments();
  if (requestCount > 0) {
    return;
  }

  if (seedData.sessions?.length) {
    await sessionsCollection.insertMany(seedData.sessions);
  }

  if (seedData.requests?.length) {
    await requestsCollection.insertMany(seedData.requests);
  }

  if (seedData.ratings?.length) {
    await ratingsCollection.insertMany(seedData.ratings);
  }

  const messageDocs = Object.entries(seedData.messages || {}).map(([requestId, messages]) => ({
    requestId,
    messages,
  }));

  if (messageDocs.length) {
    await messagesCollection.insertMany(messageDocs);
  }
}

async function readData() {
  const users = await usersCollection.find({}).toArray();
  const sessions = await sessionsCollection.find({}).toArray();
  const requests = await requestsCollection.find({}).toArray();
  const ratings = await ratingsCollection.find({}).toArray();
  const messageDocs = await messagesCollection.find({}).toArray();

  const messages = {};
  for (const doc of messageDocs) {
    messages[doc.requestId] = Array.isArray(doc.messages) ? doc.messages : [];
  }

  const data = {
    users,
    sessions,
    requests,
    ratings,
    messages,
    restaurants: ualbanyRestaurants,
  };

  let changed = false;
  changed = normalizeDataRelationships(data) || changed;

  for (const demoUser of demoUsers) {
    if (!data.users.some((entry) => entry.email === demoUser.email.toLowerCase())) {
      data.users.push({ ...demoUser });
      changed = true;
    }
  }
  const normalizedRestaurants = JSON.stringify(ualbanyRestaurants);

  for (const user of data.users) {
    if (
      (user.email === "ariana.green@albany.edu" || user.email === "marcus.hall@albany.edu") &&
      typeof user.password === "string" &&
      verifyPassword("demo123", user.password)
    ) {
      user.password = hashPassword("demo1234");
      changed = true;
    }
    if (typeof user.password === "string" && user.password && !user.password.includes(":")) {
      user.password = hashPassword(user.password);
      changed = true;
    }
    if (typeof user.foodSafetyVerified !== "boolean") {
      user.foodSafetyVerified = user.role === "courier";
      changed = true;
    }
    if (typeof user.phone !== "string") {
      user.phone = "518-555-0100";
      changed = true;
    }
    if (typeof user.bio !== "string") {
      user.bio = "UAlbany student account.";
      changed = true;
    }
    if (typeof user.rating !== "number") {
      user.rating = 5;
      changed = true;
    }
    if (typeof user.completedJobs !== "number") {
      user.completedJobs = 0;
      changed = true;
    }
    if (typeof user.earnings !== "number") {
      user.earnings = 0;
      changed = true;
    }
    if (user.authProvider !== "outlook" && user.authProvider !== "password") {
      user.authProvider = "password";
      changed = true;
    }
    if (typeof user.ualbanyIdUploaded !== "boolean") {
      user.ualbanyIdUploaded = Boolean(user.ualbanyIdImage) || user.email === "marcus.hall@albany.edu";
      changed = true;
    }
    if (typeof user.ualbanyIdImage !== "string") {
      user.ualbanyIdImage = user.email === "marcus.hall@albany.edu" ? "demo-ualbany-id-on-file" : "";
      changed = true;
    }
    if (!user.ualbanyIdUploaded && typeof user.ualbanyIdImage === "string" && user.ualbanyIdImage.trim()) {
      user.ualbanyIdUploaded = true;
      changed = true;
    }
    if (typeof user.notificationsEnabled !== "boolean") {
      user.notificationsEnabled = false;
      changed = true;
    }
    if (typeof user.courierOnline !== "boolean") {
      user.courierOnline = false;
      changed = true;
    }
    if (typeof user.suspended !== "boolean") {
      user.suspended = false;
      changed = true;
    }
    if (typeof user.suspendedReason !== "string") {
      user.suspendedReason = "";
      changed = true;
    }
  }

  if (JSON.stringify(data.restaurants || []) !== normalizedRestaurants) {
    data.restaurants = ualbanyRestaurants;
    changed = true;
  }

  for (const request of data.requests) {
    if (request.pickup === "Campus Center Panda Express") {
      request.pickup = "Baba's Pizza";
      changed = true;
    }
    if (request.pickup === "Campus Center Halal Shack") {
      request.pickup = "The Halal Shack";
      changed = true;
    }
    if ("dropoffPinLabel" in request || "dropoffPinX" in request || "dropoffPinY" in request) {
      delete request.dropoffPinLabel;
      delete request.dropoffPinX;
      delete request.dropoffPinY;
      changed = true;
    }
    if (typeof request.estimatedRetailTotal !== "number") {
      request.estimatedRetailTotal = null;
      changed = true;
    }
    if (typeof request.foodReady !== "boolean") {
      request.foodReady = false;
      changed = true;
    }
    if (typeof request.foodReadyAt !== "string") {
      request.foodReadyAt = "";
      changed = true;
    }
    if (typeof request.estimatedDiscountCost !== "number") {
      request.estimatedDiscountCost =
        request.serviceType === "discount" && typeof request.estimatedRetailTotal === "number"
          ? Number((request.estimatedRetailTotal * (1 - DISCOUNT_RATE)).toFixed(2))
          : null;
      changed = true;
    }
    if (typeof request.runnerEarnings !== "number") {
      request.runnerEarnings =
        request.serviceType === "discount" &&
        typeof request.estimatedDiscountCost === "number" &&
        Number.isFinite(Number.parseFloat(request.payment))
          ? Number((Number.parseFloat(request.payment) - request.estimatedDiscountCost).toFixed(2))
          : null;
      changed = true;
    }
    if (request.paymentStatus !== "paid") {
      const normalizedStatus =
        request.paymentStatus === "pending" || request.paymentStatus === "failed" ? request.paymentStatus : "unpaid";
      if (request.paymentStatus !== normalizedStatus) {
        request.paymentStatus = normalizedStatus;
        changed = true;
      }
    }
    if (typeof request.paidAt !== "string") {
      request.paidAt = "";
      changed = true;
    }
    if (typeof request.stripeCheckoutSessionId !== "string") {
      request.stripeCheckoutSessionId = "";
      changed = true;
    }
    if (typeof request.flagged !== "boolean") {
      request.flagged = false;
      changed = true;
    }
    if (typeof request.flaggedReason !== "string") {
      request.flaggedReason = "";
      changed = true;
    }
    if (
      request.moderationStatus !== "clear" &&
      request.moderationStatus !== "flagged" &&
      request.moderationStatus !== "removed"
    ) {
      request.moderationStatus = request.flagged ? "flagged" : "clear";
      changed = true;
    }
    if (typeof request.removedAt !== "string") {
      request.removedAt = "";
      changed = true;
    }
    if (typeof request.removedBy !== "string") {
      request.removedBy = "";
      changed = true;
    }
  }

  if (!Array.isArray(data.ratings)) {
    data.ratings = [];
    changed = true;
  }

  if (changed) {
    await writeData(data);
  }

  return data;
}

async function writeData(data) {
  await replaceCollectionDocuments(usersCollection, data.users);
  await replaceCollectionDocuments(sessionsCollection, data.sessions);
  await replaceCollectionDocuments(requestsCollection, data.requests);
  await replaceCollectionDocuments(ratingsCollection, data.ratings);

  await messagesCollection.deleteMany({});
  const messageDocs = Object.entries(data.messages || {}).map(([requestId, messages]) => ({
    requestId,
    messages: messages.map(({ _id, ...rest }) => rest),
  }));

  if (messageDocs.length) {
    await messagesCollection.insertMany(messageDocs);
  }
}

async function replaceCollectionDocuments(collection, documents = []) {
  await collection.deleteMany({});
  if (!documents.length) {
    return;
  }

  await collection.insertMany(documents.map(({ _id, ...rest }) => rest));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
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
    sendJson(response, 401, { error: "Missing session token." });
    return null;
  }

  const data = await readData();
  const session = data.sessions.find((entry) => entry.token === token);

  if (!session || isExpiredSession(session)) {
    if (session) {
      data.sessions = data.sessions.filter((entry) => entry.token !== token);
      await writeData(data);
    }
    sendJson(response, 401, { error: "Session expired. Please log in again." });
    return null;
  }

  const user = data.users.find((entry) => entry.id === session.userId);
  if (!user) {
    data.sessions = data.sessions.filter((entry) => entry.token !== token);
    await writeData(data);
    sendJson(response, 401, { error: "User not found." });
    return null;
  }

  if (user.suspended) {
    sendJson(response, 403, {
      error: user.suspendedReason
        ? `This account is suspended: ${user.suspendedReason}`
        : "This account is suspended.",
    });
    return null;
  }

  return { data, user };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 404, { error: "Missing URL." });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1:4174");

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, backend: "mongodb" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      const role = body.role === "courier" ? "courier" : "requester";
      const ualbanyIdImage = String(body.ualbanyIdImage || "").trim();

      if (!name || !email || !phone || !password) {
        sendJson(response, 400, { error: "Name, phone, email, and password are required." });
        return;
      }

      if (!isCampusEmail(email)) {
        sendJson(response, 400, { error: "Only .edu email addresses are allowed." });
        return;
      }

      if (password.length < 8) {
        sendJson(response, 400, { error: "Password must be at least 8 characters." });
        return;
      }

      if (role === "courier" && !ualbanyIdImage) {
        sendJson(response, 400, { error: "Courier accounts need a UAlbany ID photo." });
        return;
      }

      const data = await readData();
      if (data.users.some((user) => user.email === email)) {
        sendJson(response, 409, { error: "That email is already registered." });
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

      data.users.push(user);
      const session = replaceUserSession(data, user.id);
      await writeData(data);
      sendJson(response, 201, { token: session.token, user: sanitizeUser(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/outlook") {
      const body = await readBody(request);
      const idToken = String(body.idToken || "").trim();
      const phone = String(body.phone || "").trim();
      const role = body.role === "courier" ? "courier" : "requester";
      const ualbanyIdImage = String(body.ualbanyIdImage || "").trim();

      if (!idToken) {
        sendJson(response, 400, { error: "Microsoft ID token is required." });
        return;
      }

      const microsoftUser = await verifyMicrosoftIdToken(idToken);
      const { email, name } = microsoftUser;

      const data = await readData();
      let user = data.users.find((entry) => entry.email === email);

      if (user) {
        if (name) {
          user.name = name;
        }
        if (phone) {
          user.phone = phone;
        }
        if (role === "courier") {
          user.role = "courier";
          user.courierMode = true;
          if (ualbanyIdImage) {
            user.ualbanyIdImage = ualbanyIdImage;
            user.ualbanyIdUploaded = true;
          }
        }
        user.authProvider = "outlook";
      } else {
        if (role === "courier" && !ualbanyIdImage) {
          sendJson(response, 400, { error: "Courier accounts need a UAlbany ID photo." });
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
        data.users.push(user);
      }

      const session = replaceUserSession(data, user.id);
      await writeData(data);
      sendJson(response, 200, { token: session.token, user: sanitizeUser(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const data = await readData();
      const user = data.users.find((entry) => entry.email === email);

      if (user?.authProvider === "outlook") {
        sendJson(response, 400, { error: "This account uses Outlook. Use the Outlook button to continue." });
        return;
      }
      if (!user || !verifyPassword(password, user.password)) {
        sendJson(response, 401, { error: "Invalid email or password." });
        return;
      }

      const session = replaceUserSession(data, user.id);
      await writeData(data);
      sendJson(response, 200, { token: session.token, user: sanitizeUser(user) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = getToken(request);
      if (token) {
        const data = await readData();
        const nextSessions = data.sessions.filter((entry) => entry.token !== token);
        if (nextSessions.length !== data.sessions.length) {
          data.sessions = nextSessions;
          await writeData(data);
        }
      }

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const auth = await requireUser(request, response);
      if (!auth) return;
      sendJson(response, 200, { user: sanitizeUser(auth.user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const auth = await requireUser(request, response);
      if (!auth) return;
      sendJson(response, 200, {
        user: sanitizeUser(auth.user),
        restaurants: auth.data.restaurants,
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

      sendJson(response, 200, {
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

      const body = await readBody(request);
      const startCheckout = body.startCheckout === true;
      const activeRequestCount = auth.data.requests.filter(
        (entry) =>
          entry.userId === auth.user.id && (entry.status === "open" || entry.status === "accepted"),
      ).length;

      if (activeRequestCount >= MAX_ACTIVE_REQUESTS_PER_USER) {
        sendJson(response, 400, {
          error: `You can only have ${MAX_ACTIVE_REQUESTS_PER_USER} active orders at a time.`,
        });
        return;
      }

      const requestRecord = {
        id: `request-${crypto.randomUUID()}`,
        userId: auth.user.id,
        requesterName: auth.user.name,
        serviceType: String(body.serviceType || "food"),
        pickup: String(body.pickup || "").trim(),
        destination: String(body.destination || "").trim(),
        time: String(body.time || "").trim(),
        payment: String(body.payment || "").trim(),
        notes: String(body.notes || "").trim(),
        orderEta: String(body.orderEta || "").trim(),
        foodReady: false,
        foodReadyAt: "",
        orderScreenshot: String(body.orderScreenshot || "").trim(),
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
        sendJson(response, 400, { error: "Pickup, time, and payment are required." });
        return;
      }

      const paymentAmount = Number.parseFloat(requestRecord.payment);
      if (!Number.isFinite(paymentAmount) || paymentAmount < MIN_PAYMENT_OFFER) {
        sendJson(response, 400, { error: `Payment offers must be at least $${MIN_PAYMENT_OFFER}.` });
        return;
      }

      if (requestRecord.serviceType === "discount") {
        if (!Number.isFinite(requestRecord.estimatedRetailTotal)) {
          sendJson(response, 400, { error: "Estimated retail total is required for discount dollar runs." });
          return;
        }

        requestRecord.estimatedDiscountCost = Number((requestRecord.estimatedRetailTotal * (1 - DISCOUNT_RATE)).toFixed(2));
        requestRecord.runnerEarnings = Number((paymentAmount - requestRecord.estimatedDiscountCost).toFixed(2));

        if (requestRecord.runnerEarnings <= 0) {
          sendJson(response, 400, { error: "Platform payment must leave room for the runner to earn money." });
          return;
        }
      }

      applyAutomaticModeration(requestRecord);

      const duplicateRequest = findRecentDuplicateRequest(auth.data.requests, requestRecord);
      if (duplicateRequest) {
        sendJson(response, 200, {
          duplicate: true,
          request: decorateRequest(duplicateRequest, auth.data),
        });
        return;
      }

      auth.data.requests.push(requestRecord);
      auth.data.messages[requestRecord.id] = [
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
          sendJson(response, 400, { error: "Request payment amount is invalid." });
          return;
        }

        const session = await createStripeCheckoutSession({
          amount: amountNumber,
          requestId: requestRecord.id,
          requesterEmail: auth.user.email,
          description: `${requestRecord.pickup} to ${requestRecord.destination || "campus drop-off"}`,
        });

        requestRecord.paymentStatus = "pending";
        requestRecord.stripeCheckoutSessionId = String(session.id || "");
        auth.data.messages[requestRecord.id].push({
          id: `message-${crypto.randomUUID()}`,
          senderId: auth.user.id,
          senderName: auth.user.name,
          text: "Stripe Checkout started for this request.",
          createdAt: new Date().toISOString(),
        });
        await writeData(auth.data);
        sendJson(response, 201, { request: decorateRequest(requestRecord, auth.data), checkoutUrl: session.url });
        return;
      }

      await writeData(auth.data);
      sendJson(response, 201, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/accept")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (requestRecord.serviceType === "food" && !auth.user.foodSafetyVerified) {
        sendJson(response, 403, { error: "Verify your campus email before accepting food deliveries." });
        return;
      }

      if (requestRecord.userId === auth.user.id) {
        sendJson(response, 400, { error: "You cannot accept your own request." });
        return;
      }

      if (requestRecord.status === "accepted" && requestRecord.acceptedBy && requestRecord.acceptedBy !== auth.user.id) {
        sendJson(response, 409, { error: "This request was already accepted by another courier." });
        return;
      }

      if (requestRecord.status !== "open" && requestRecord.acceptedBy !== auth.user.id) {
        sendJson(response, 400, { error: "This request is no longer open." });
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
      sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/requests/") && url.pathname.endsWith("/ready")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (requestRecord.userId !== auth.user.id) {
        sendJson(response, 403, { error: "Only the requester can mark this order as ready." });
        return;
      }

      if (requestRecord.serviceType !== "food") {
        sendJson(response, 400, { error: "Only food requests can be marked ready." });
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
      sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    const routeContext = {
      request,
      response,
      url,
      requireUser,
      sendJson,
      readBody,
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

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

await ensureSeedData();
await readData();
await ensureIndex(usersCollection, { email: 1 }, { unique: true });

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";

server.listen(port, host, () => {
  console.log(`CampusConnect API running at http://${host}:${port} (MongoDB connected)`);
});
