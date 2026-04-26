// File purpose:
// Local JSON persistence and seed normalization for the prototype backend.

import fs from "node:fs/promises";
import { dataDir, dataFile, DISCOUNT_RATE, ualbanyRestaurants } from "./config.mjs";
import { hashPassword, verifyPassword } from "./auth.mjs";

export const seedData = {
  users: [
    {
      id: "user-requester-1",
      name: "Ariana Green",
      email: "ariana.green@albany.edu",
      phone: "518-555-0141",
      password: hashPassword("demo1234"),
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

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const demoUsers = seedData.users.map((user) => ({ ...user }));
const demoUserByEmail = new Map(demoUsers.map((user) => [user.email.toLowerCase(), user]));

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

  for (const request of data.requests) {
    const nextUserId = resolveUserId(request.userId);
    if (nextUserId !== request.userId) {
      request.userId = nextUserId;
      changed = true;
    }
    if (request.acceptedBy) {
      const nextAcceptedBy = resolveUserId(request.acceptedBy);
      if (nextAcceptedBy !== request.acceptedBy) {
        request.acceptedBy = nextAcceptedBy;
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

export async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seedData, null, 2));
  }
}

export async function writeData(data) {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
}

export async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  const data = JSON.parse(raw);

  let changed = false;
  changed = normalizeDataRelationships(data) || changed;
  const normalizedRestaurants = JSON.stringify(ualbanyRestaurants);

  for (const demoUser of demoUsers) {
    if (!data.users.some((entry) => entry.email === demoUser.email.toLowerCase())) {
      data.users.push({ ...demoUser });
      changed = true;
    }
  }

  for (const user of data.users) {
    if (
      (user.email === "ariana.green@albany.edu" || user.email === "marcus.hall@albany.edu") &&
      typeof user.password === "string" &&
      verifyPassword("demo123", user.password)
    ) {
      user.password = hashPassword("demo1234");
      changed = true;
    }
    if (typeof user.password === "string" && !user.password.includes(":")) {
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
  }

  if (changed) {
    await writeData(data);
  }

  return data;
}
