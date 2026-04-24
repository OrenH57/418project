// File purpose:
// Lightweight local backend for the CampusConnect prototype.
// Handles auth, requests, messages, profile updates, verification, and optional Stripe checkout.

import http from "node:http";
import path from "node:path";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  DISCOUNT_RATE,
  MIN_PAYMENT_OFFER,
  getAzureClientId,
  getAzureTenantId,
  loadEnv,
  ualbanyRestaurants,
} from "./lib/config.mjs";
import { createStripeCheckoutSession } from "./lib/payments.mjs";

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
await requestsCollection.createIndex({ id: 1 }, { unique: true });
await messagesCollection.createIndex({ requestId: 1 }, { unique: true });
const microsoftJwks = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));
const MAX_ACTIVE_REQUESTS_PER_USER = 3;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword.includes(":")) {
    return storedPassword === password;
  }

  const [salt, storedHash] = storedPassword.split(":");
  const computedHash = crypto.scryptSync(password, salt, 64);
  const originalHash = Buffer.from(storedHash, "hex");

  if (computedHash.length !== originalHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedHash, originalHash);
}

function isCampusEmail(email) {
  return email.endsWith(".edu") || email.endsWith("@albany.edu");
}

async function verifyMicrosoftIdToken(idToken) {
  const azureClientId = getAzureClientId();
  const azureTenantId = getAzureTenantId();

  if (!azureClientId || !azureTenantId) {
    throw new Error("Microsoft sign-in is not configured on the backend yet.");
  }

  const { payload } = await jwtVerify(idToken, microsoftJwks, {
    audience: azureClientId,
    issuer: [
      `https://login.microsoftonline.com/${azureTenantId}/v2.0`,
      `https://sts.windows.net/${azureTenantId}/`,
    ],
  });

  if (payload.tid !== azureTenantId) {
    throw new Error("Only University at Albany Microsoft accounts are allowed.");
  }

  const email = String(
    payload.preferred_username || payload.email || payload.upn || "",
  ).trim().toLowerCase();

  if (!email || !isCampusEmail(email)) {
    throw new Error("Only campus Outlook addresses are allowed.");
  }

  return {
    email,
    name: String(payload.name || email.split("@")[0] || "UAlbany Student").trim(),
  };
}

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

  for (const demoUser of demoUsers) {
    if (!data.users.some((entry) => entry.email === demoUser.email)) {
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
  console.log("writeData users count:", data.users?.length);
  console.log("writeData sessions count:", data.sessions?.length);
  console.log("writeData requests count:", data.requests?.length);
  console.log("writeData ratings count:", data.ratings?.length);
  console.log("writeData messages count:", Object.keys(data.messages || {}).length);

  await usersCollection.deleteMany({});
  if (data.users?.length) {
    await usersCollection.insertMany(data.users.map(({ _id, ...rest }) => rest));
  }

  await sessionsCollection.deleteMany({});
  if (data.sessions?.length) {
    await sessionsCollection.insertMany(data.sessions.map(({ _id, ...rest }) => rest));
  }

  await requestsCollection.deleteMany({});
  if (data.requests?.length) {
    await requestsCollection.insertMany(data.requests.map(({ _id, ...rest }) => rest));
  }

  await ratingsCollection.deleteMany({});
  if (data.ratings?.length) {
    await ratingsCollection.insertMany(data.ratings.map(({ _id, ...rest }) => rest));
  }

  await messagesCollection.deleteMany({});
  const messageDocs = Object.entries(data.messages || {}).map(([requestId, messages]) => ({
    requestId,
    messages: messages.map(({ _id, ...rest }) => rest),
  }));

  if (messageDocs.length) {
    await messagesCollection.insertMany(messageDocs);
  }
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

function createToken() {
  return crypto.randomBytes(24).toString("hex");
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

const blockedRequestKeywords = [
  "weapon",
  "drugs",
  "alcohol run",
  "fake id",
  "stolen",
];

function requireAdmin(user, response) {
  if (user.role !== "admin") {
    sendJson(response, 403, { error: "Only admin accounts can access that page." });
    return false;
  }
  return true;
}

function matchesBlockedKeyword(requestRecord) {
  const haystack = [
    requestRecord.pickup,
    requestRecord.destination,
    requestRecord.notes,
  ]
    .join(" ")
    .toLowerCase();
  return blockedRequestKeywords.find((keyword) => haystack.includes(keyword));
}

function applyAutomaticModeration(requestRecord) {
  const blockedKeyword = matchesBlockedKeyword(requestRecord);
  if (!blockedKeyword) {
    return;
  }

  requestRecord.flagged = true;
  requestRecord.flaggedReason = `Matched blocked keyword: ${blockedKeyword}`;
  requestRecord.moderationStatus = "flagged";
}

function buildAdminOverview(data) {
  const visibleRequests = data.requests.filter((entry) => entry.moderationStatus !== "removed");
  const grossVolume = visibleRequests.reduce(
    (total, entry) => total + (Number.isFinite(Number.parseFloat(entry.payment || "0")) ? Number.parseFloat(entry.payment) : 0),
    0,
  );

  return {
    flaggedRequests: data.requests
      .filter((entry) => entry.moderationStatus === "flagged")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    moderatedRequests: data.requests
      .filter((entry) => entry.moderationStatus === "removed")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    users: data.users
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => sanitizeUser(entry)),
    blockedKeywords: blockedRequestKeywords,
    metrics: {
      activeUsers: data.users.filter((entry) => !entry.suspended).length,
      openRequests: visibleRequests.filter((entry) => entry.status === "open").length,
      flaggedCases: data.requests.filter((entry) => entry.moderationStatus === "flagged").length,
      suspendedUsers: data.users.filter((entry) => entry.suspended).length,
      grossVolume: `$${grossVolume.toFixed(0)}`,
    },
  };
}

function canAccessRequest(userId, requestRecord) {
  return requestRecord.userId === userId || requestRecord.acceptedBy === userId;
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

  if (!session) {
    sendJson(response, 401, { error: "Session expired. Please log in again." });
    return null;
  }

  const user = data.users.find((entry) => entry.id === session.userId);
  if (!user) {
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

function formatRelativeTime(iso) {
  const diffMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const hours = Math.round(diffMinutes / 60);
  return `${hours} hr ago`;
}

function decorateRequest(record, data) {
  const courier = record.acceptedBy
    ? data.users.find((entry) => entry.id === record.acceptedBy)
    : null;
  const requester = data.users.find((entry) => entry.id === record.userId);

  return {
    ...record,
    requesterPhone: requester?.phone || "",
    timeAgo: formatRelativeTime(record.createdAt),
    courierName: courier?.name ?? null,
  };
}

function normalizeRequestField(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function findRecentDuplicateRequest(requests, candidate) {
  const duplicateWindowMs = 10 * 60 * 1000;
  const candidateCreatedAt = Date.now();

  return requests.find((entry) => {
    if (entry.userId !== candidate.userId) return false;
    if (entry.status !== "open" && entry.status !== "accepted") return false;

    const entryCreatedAt = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(entryCreatedAt) || candidateCreatedAt - entryCreatedAt > duplicateWindowMs) {
      return false;
    }

    return (
      normalizeRequestField(entry.serviceType) === normalizeRequestField(candidate.serviceType) &&
      normalizeRequestField(entry.pickup) === normalizeRequestField(candidate.pickup) &&
      normalizeRequestField(entry.destination) === normalizeRequestField(candidate.destination) &&
      normalizeRequestField(entry.time) === normalizeRequestField(candidate.time) &&
      normalizeRequestField(entry.payment) === normalizeRequestField(candidate.payment) &&
      normalizeRequestField(entry.notes) === normalizeRequestField(candidate.notes) &&
      normalizeRequestField(entry.orderEta) === normalizeRequestField(candidate.orderEta) &&
      normalizeRequestField(entry.orderScreenshot) === normalizeRequestField(candidate.orderScreenshot)
    );
  });
}

function getZoneFromDestination(destination = "") {
  const normalized = destination.toLowerCase();

  if (normalized.includes("state")) return "State Quad";
  if (normalized.includes("dutch")) return "Dutch Quad";
  if (normalized.includes("colonial")) return "Colonial Quad";
  if (normalized.includes("indigenous")) return "Indigenous Quad";
  if (normalized.includes("empire")) return "Empire Commons";
  if (normalized.includes("freedom")) return "Freedom Apartments";
  if (normalized.includes("liberty")) return "Liberty Terrace";
  if (normalized.includes("library")) return "Library";
  if (normalized.includes("massry")) return "Massry Center";
  return "Campus Center";
}

function getCampusSnapshot(data, currentUserId) {
  const openRequests = data.requests.filter((entry) => entry.status === "open");
  const onlineCouriers = data.users.filter((entry) => entry.courierOnline).length;
  const avgPayout =
    openRequests.length > 0
      ? Number(
          (
            openRequests.reduce((total, entry) => total + Number.parseFloat(entry.payment || "0"), 0) /
            openRequests.length
          ).toFixed(0),
        )
      : 0;

  const zoneCounts = new Map();
  for (const requestRecord of openRequests) {
    const zone = getZoneFromDestination(requestRecord.destination || requestRecord.pickup || "");
    zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1);
  }

  const busiestZone =
    [...zoneCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "Campus Center";

  const myRecentRequests = data.requests
    .filter((entry) => entry.userId === currentUserId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3)
    .map((entry) => ({
      id: entry.id,
      serviceType: entry.serviceType,
      pickup: entry.pickup,
      destination: entry.destination,
      payment: entry.payment,
      notes: entry.notes,
    }));

  return {
    onlineCouriers,
    openRequests: openRequests.length,
    avgPayout,
    busiestZone,
    lunchRushLabel: openRequests.length >= 4 ? "Busy right now" : openRequests.length >= 2 ? "Picking up" : "Quiet right now",
    myRecentRequests,
  };
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

      const token = createToken();
      data.users.push(user);
      data.sessions.push({ token, userId: user.id });
      await writeData(data);
      sendJson(response, 201, { token, user: sanitizeUser(user) });
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

      const token = createToken();
      data.sessions.push({ token, userId: user.id });
      await writeData(data);
      sendJson(response, 200, { token, user: sanitizeUser(user) });
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

      const token = createToken();
      data.sessions.push({ token, userId: user.id });
      await writeData(data);
      sendJson(response, 200, { token, user: sanitizeUser(user) });
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
        sendJson(response, 409, {
          error:
            duplicateRequest.paymentStatus === "pending"
              ? "This order is already pending payment. Open it from Messages instead of submitting again."
              : "This order was already created recently. Open the existing request from Messages instead of submitting it again.",
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

    if (request.method === "GET" && url.pathname.startsWith("/api/messages/")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Conversation not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (!canAccessRequest(auth.user.id, requestRecord)) {
        sendJson(response, 403, { error: "You do not have access to this conversation." });
        return;
      }

      sendJson(response, 200, {
        request: decorateRequest(requestRecord, auth.data),
        messages: (auth.data.messages[requestId] || []).map((message) => ({
          ...message,
          mine: message.senderId === auth.user.id,
          time: new Date(message.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        })),
      });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/messages/")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
      const body = await readBody(request);
      const text = String(body.text || "").trim();

      if (!requestRecord) {
        sendJson(response, 404, { error: "Conversation not found." });
        return;
      }

      if (requestRecord.moderationStatus === "removed") {
        sendJson(response, 410, { error: "This request was removed by an admin." });
        return;
      }

      if (!canAccessRequest(auth.user.id, requestRecord)) {
        sendJson(response, 403, { error: "You do not have access to this conversation." });
        return;
      }

      if (!text) {
        sendJson(response, 400, { error: "Message text is required." });
        return;
      }

      auth.data.messages[requestId] = auth.data.messages[requestId] || [];
      auth.data.messages[requestId].push({
        id: `message-${crypto.randomUUID()}`,
        senderId: auth.user.id,
        senderName: auth.user.name,
        text,
        createdAt: new Date().toISOString(),
      });
      await writeData(auth.data);
      sendJson(response, 201, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/ratings/")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (!canAccessRequest(auth.user.id, requestRecord)) {
        sendJson(response, 403, { error: "You do not have access to this rating flow." });
        return;
      }

      const isRequester = requestRecord.userId === auth.user.id;
      const targetUserId = isRequester ? requestRecord.acceptedBy : requestRecord.userId;
      const targetUser = targetUserId ? auth.data.users.find((entry) => entry.id === targetUserId) ?? null : null;
      const existingRating =
        auth.data.ratings.find((entry) => entry.requestId === requestId && entry.authorUserId === auth.user.id) ?? null;

      sendJson(response, 200, {
        canRate: Boolean(targetUser),
        requestId,
        targetUser: targetUser ? { id: targetUser.id, name: targetUser.name } : null,
        existingRating,
      });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/ratings/")) {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const requestId = url.pathname.split("/")[3];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (!canAccessRequest(auth.user.id, requestRecord)) {
        sendJson(response, 403, { error: "You do not have access to this rating flow." });
        return;
      }

      const body = await readBody(request);
      const ratingValue = Number(body.rating);
      const comment = String(body.comment || "").trim();
      const isRequester = requestRecord.userId === auth.user.id;
      const targetUserId = isRequester ? requestRecord.acceptedBy : requestRecord.userId;

      if (!targetUserId) {
        sendJson(response, 400, { error: "A courier must accept the request before you can leave a rating." });
        return;
      }

      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        sendJson(response, 400, { error: "Ratings must be a whole number between 1 and 5." });
        return;
      }

      const targetUser = auth.data.users.find((entry) => entry.id === targetUserId);

      if (!targetUser) {
        sendJson(response, 404, { error: "The person you are trying to rate was not found." });
        return;
      }

      const ratingRecord = {
        requestId,
        authorUserId: auth.user.id,
        targetUserId,
        rating: ratingValue,
        comment,
        createdAt: new Date().toISOString(),
      };
      const existingIndex = auth.data.ratings.findIndex(
        (entry) => entry.requestId === requestId && entry.authorUserId === auth.user.id,
      );

      if (existingIndex >= 0) {
        auth.data.ratings[existingIndex] = ratingRecord;
      } else {
        auth.data.ratings.push(ratingRecord);
      }

      const userRatings = auth.data.ratings.filter((entry) => entry.targetUserId === targetUserId);
      const averageRating =
        userRatings.reduce((total, entry) => total + entry.rating, 0) / userRatings.length;
      targetUser.rating = Number(averageRating.toFixed(1));

      await writeData(auth.data);
      sendJson(response, 201, {
        ok: true,
        rating: ratingRecord,
        targetUser: { id: targetUser.id, name: targetUser.name, rating: targetUser.rating },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      sendJson(response, 200, {
        profile: {
          ...sanitizeUser(auth.user),
          postedRequests: auth.data.requests.filter((entry) => entry.userId === auth.user.id).length,
          acceptedRequests: auth.data.requests.filter((entry) => entry.acceptedBy === auth.user.id).length,
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/request-verification-code") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const code = String(Math.floor(100000 + Math.random() * 900000));
      auth.user.pendingVerificationCode = code;
      auth.user.pendingVerificationIssuedAt = new Date().toISOString();
      await writeData(auth.data);
      sendJson(response, 200, { ok: true, previewCode: code });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/verify-code") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const body = await readBody(request);
      const code = String(body.code || "").trim();

      if (!code || auth.user.pendingVerificationCode !== code) {
        sendJson(response, 400, { error: "That verification code is not correct." });
        return;
      }

      auth.user.foodSafetyVerified = true;
      delete auth.user.pendingVerificationCode;
      delete auth.user.pendingVerificationIssuedAt;
      await writeData(auth.data);
      sendJson(response, 200, { user: sanitizeUser(auth.user) });
      return;
    }

    if (request.method === "PATCH" && url.pathname === "/api/profile") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const body = await readBody(request);
      auth.user.courierMode = Boolean(body.courierMode);
      auth.user.bio = typeof body.bio === "string" ? body.bio : auth.user.bio;
      if (typeof body.notificationsEnabled === "boolean") {
        auth.user.notificationsEnabled = body.notificationsEnabled;
      }
      if (typeof body.courierOnline === "boolean") {
        auth.user.courierOnline = body.courierOnline;
      }
      if (typeof body.ualbanyIdImage === "string") {
        auth.user.ualbanyIdImage = body.ualbanyIdImage;
        auth.user.ualbanyIdUploaded = Boolean(body.ualbanyIdImage.trim());
      }
      await writeData(auth.data);
      sendJson(response, 200, { user: sanitizeUser(auth.user) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
      const auth = await requireUser(request, response);
      if (!auth) return;
      if (!requireAdmin(auth.user, response)) return;

      sendJson(response, 200, buildAdminOverview(auth.data));
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/requests/")) {
      const auth = await requireUser(request, response);
      if (!auth) return;
      if (!requireAdmin(auth.user, response)) return;

      const requestId = url.pathname.split("/")[4];
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
      const body = await readBody(request);
      const action = String(body.action || "");
      const reason = String(body.reason || "").trim();

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (action === "flag") {
        requestRecord.flagged = true;
        requestRecord.flaggedReason = reason || requestRecord.flaggedReason || "Flagged by admin review.";
        requestRecord.moderationStatus = "flagged";
      } else if (action === "remove") {
        requestRecord.flagged = true;
        requestRecord.flaggedReason = reason || requestRecord.flaggedReason || "Removed by admin.";
        requestRecord.moderationStatus = "removed";
        requestRecord.removedAt = new Date().toISOString();
        requestRecord.removedBy = auth.user.id;
      } else if (action === "clear") {
        requestRecord.flagged = false;
        requestRecord.flaggedReason = "";
        requestRecord.moderationStatus = "clear";
        requestRecord.removedAt = "";
        requestRecord.removedBy = "";
      } else {
        sendJson(response, 400, { error: "Unsupported moderation action." });
        return;
      }

      await writeData(auth.data);
      sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/users/") && url.pathname.endsWith("/suspension")) {
      const auth = await requireUser(request, response);
      if (!auth) return;
      if (!requireAdmin(auth.user, response)) return;

      const userId = url.pathname.split("/")[4];
      const targetUser = auth.data.users.find((entry) => entry.id === userId);
      const body = await readBody(request);
      const suspended = body.suspended === true;
      const reason = String(body.reason || "").trim();

      if (!targetUser) {
        sendJson(response, 404, { error: "User not found." });
        return;
      }

      if (targetUser.role === "admin" && targetUser.id === auth.user.id) {
        sendJson(response, 400, { error: "Admins cannot suspend their own account." });
        return;
      }

      targetUser.suspended = suspended;
      targetUser.suspendedReason = suspended ? reason || "Suspended by admin review." : "";

      if (suspended) {
        for (const requestRecord of auth.data.requests) {
          if (requestRecord.userId === targetUser.id || requestRecord.acceptedBy === targetUser.id) {
            requestRecord.flagged = true;
            requestRecord.flaggedReason = `Connected to suspended account: ${targetUser.name}`;
            if (requestRecord.moderationStatus === "clear") {
              requestRecord.moderationStatus = "flagged";
            }
          }
        }
      }

      await writeData(auth.data);
      sendJson(response, 200, { user: sanitizeUser(targetUser) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/create-checkout-session") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const body = await readBody(request);
      const requestId = String(body.requestId || "");
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.userId !== auth.user.id) {
        sendJson(response, 403, { error: "Only the requester can pay the delivery fee for this request." });
        return;
      }

      const amountNumber = Math.round(Number.parseFloat(requestRecord.payment) * 100);

      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        sendJson(response, 400, { error: "Request payment amount is invalid." });
        return;
      }

      if (requestRecord.paymentStatus === "paid") {
        sendJson(response, 409, { error: "This request has already been paid." });
        return;
      }

      const session = await createStripeCheckoutSession({
        amount: amountNumber,
        requestId,
        requesterEmail: auth.user.email,
        description: `${requestRecord.pickup} to ${requestRecord.destination || "campus drop-off"}`,
      });

      requestRecord.paymentStatus = "pending";
      requestRecord.stripeCheckoutSessionId = String(session.id || "");
      await writeData(auth.data);
      sendJson(response, 200, { url: session.url });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/payments/confirm") {
      const auth = await requireUser(request, response);
      if (!auth) return;

      const body = await readBody(request);
      const requestId = String(body.requestId || "");
      const paymentState = String(body.paymentState || "");
      const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);

      if (!requestRecord) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }

      if (requestRecord.userId !== auth.user.id) {
        sendJson(response, 403, { error: "Only the requester can update payment status for this request." });
        return;
      }

      if (paymentState === "success") {
        requestRecord.paymentStatus = "paid";
        requestRecord.paidAt = new Date().toISOString();
      } else if (paymentState === "cancelled") {
        requestRecord.paymentStatus = "unpaid";
      } else {
        sendJson(response, 400, { error: "Unsupported payment state." });
        return;
      }

      auth.data.messages[requestId] = auth.data.messages[requestId] || [];
      auth.data.messages[requestId].push({
        id: `message-${crypto.randomUUID()}`,
        senderId: auth.user.id,
        senderName: auth.user.name,
        text:
          paymentState === "success"
            ? "Payment was completed in Stripe Checkout."
            : "Stripe Checkout was cancelled before payment was completed.",
        createdAt: new Date().toISOString(),
      });
      await writeData(auth.data);
      sendJson(response, 200, { request: decorateRequest(requestRecord, auth.data) });
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

await ensureSeedData();

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";

server.listen(port, host, () => {
  console.log(`CampusConnect API running at http://${host}:${port} (MongoDB connected)`);
});
