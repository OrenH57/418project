// File purpose:
// Lightweight local backend for the CampusConnect prototype.
// Handles auth, requests, messages, profile updates, verification, and optional Stripe checkout.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "app-data.json");
const rootDir = path.resolve(__dirname, "..");

async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(rootDir, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional local env file
  }
}

await loadEnv();

const ualbanyRestaurants = [
  "Baba's Pizza",
  "Damor Chai Cafe",
  "Fiamma",
  "Greens To Go",
  "Jamals Chicken",
  "Nikos Cafe",
  "Starbucks",
  "The Corner Deli",
  "The Halal Shack",
  "The Spread",
  "Yellas",
  "Zoca",
];

const APP_URL = process.env.PUBLIC_APP_URL || "http://127.0.0.1:4173";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const MIN_PAYMENT_OFFER = 4;
const DISCOUNT_RATE = 0.4;

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

const seedData = {
  users: [
    {
      id: "user-requester-1",
      name: "Ariana Green",
      email: "ariana.green@albany.edu",
      phone: "518-555-0141",
      password: hashPassword("demo123"),
<<<<<<< ours
      authProvider: "password",
=======
>>>>>>> theirs
      role: "requester",
      courierMode: false,
      ualbanyIdUploaded: false,
      ualbanyIdImage: "",
      foodSafetyVerified: false,
      notificationsEnabled: false,
      courierOnline: false,
      bio: "Late-night study group organizer who relies on campus center pickup runs.",
      rating: 4.8,
      completedJobs: 12,
      earnings: 0,
    },
    {
      id: "user-courier-1",
      name: "Marcus Hall",
      email: "marcus.hall@albany.edu",
      phone: "518-555-0188",
      password: hashPassword("demo123"),
<<<<<<< ours
      authProvider: "password",
=======
>>>>>>> theirs
      role: "courier",
      courierMode: true,
      ualbanyIdUploaded: true,
      ualbanyIdImage: "demo-ualbany-id-on-file",
      foodSafetyVerified: true,
      notificationsEnabled: true,
      courierOnline: true,
      bio: "Student courier covering Dutch and State Quads between classes.",
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

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seedData, null, 2));
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  const data = JSON.parse(raw);

  let changed = false;
  const normalizedRestaurants = JSON.stringify(ualbanyRestaurants);
  for (const user of data.users) {
    if (typeof user.password === "string" && !user.password.includes(":")) {
      user.password = hashPassword(user.password);
      changed = true;
    }
    if (typeof user.foodSafetyVerified !== "boolean") {
      user.foodSafetyVerified = user.role === "courier";
      changed = true;
    }
    if (typeof user.phone !== "string") {
      user.phone = "";
      changed = true;
    }
<<<<<<< ours
    if (user.authProvider !== "outlook" && user.authProvider !== "password") {
      user.authProvider = "password";
      changed = true;
    }
=======
>>>>>>> theirs
    if (typeof user.ualbanyIdUploaded !== "boolean") {
      user.ualbanyIdUploaded = user.email === "marcus.hall@albany.edu";
      changed = true;
    }
    if (typeof user.ualbanyIdImage !== "string") {
      user.ualbanyIdImage = user.email === "marcus.hall@albany.edu" ? "demo-ualbany-id-on-file" : "";
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

async function writeData(data) {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
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
<<<<<<< ours
    authProvider: user.authProvider === "outlook" ? "outlook" : "password",
=======
>>>>>>> theirs
    role: user.role,
    courierMode: user.courierMode,
    ualbanyIdUploaded: Boolean(user.ualbanyIdUploaded),
    ualbanyIdImage: user.ualbanyIdImage || "",
    foodSafetyVerified: Boolean(user.foodSafetyVerified),
    notificationsEnabled: Boolean(user.notificationsEnabled),
    courierOnline: Boolean(user.courierOnline),
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

  if (!session) {
    sendJson(response, 401, { error: "Session expired. Please log in again." });
    return null;
  }

  const user = data.users.find((entry) => entry.id === session.userId);
  if (!user) {
    sendJson(response, 401, { error: "User not found." });
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

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function createStripeCheckoutSession({ amount, requestId, requesterEmail, description }) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY in .env.local.");
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
      sendJson(response, 200, { ok: true, backend: "local-json" });
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
<<<<<<< ours
        authProvider: "password",
=======
>>>>>>> theirs
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

<<<<<<< ours
    if (request.method === "POST" && url.pathname === "/api/auth/outlook") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const role = body.role === "courier" ? "courier" : "requester";
      const ualbanyIdImage = String(body.ualbanyIdImage || "").trim();

      if (!email) {
        sendJson(response, 400, { error: "Campus email is required." });
        return;
      }

      if (!isCampusEmail(email)) {
        sendJson(response, 400, { error: "Only campus Outlook addresses are allowed." });
        return;
      }

      if (role === "courier" && !ualbanyIdImage) {
        sendJson(response, 400, { error: "Courier accounts need a UAlbany ID photo." });
        return;
      }

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
          user.ualbanyIdImage = ualbanyIdImage;
          user.ualbanyIdUploaded = true;
        }
        user.authProvider = "outlook";
      } else {
        if (!name || !phone) {
          sendJson(response, 400, { error: "Name and phone are required to create an Outlook account." });
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

=======
>>>>>>> theirs
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const data = await readData();
      const user = data.users.find((entry) => entry.email === email);

<<<<<<< ours
      if (user?.authProvider === "outlook") {
        sendJson(response, 400, { error: "This account uses Outlook. Use the Outlook button to continue." });
        return;
      }

=======
>>>>>>> theirs
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
        status: "open",
        acceptedBy: null,
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

      if (requestRecord.serviceType === "food" && !auth.user.foodSafetyVerified) {
        sendJson(response, 403, { error: "Verify your campus email before accepting food deliveries." });
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
      const body = await readBody(request);
      const text = String(body.text || "").trim();

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

      const amountNumber = Math.round(Number.parseFloat(requestRecord.payment) * 100);

      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        sendJson(response, 400, { error: "Request payment amount is invalid." });
        return;
      }

      const session = await createStripeCheckoutSession({
        amount: amountNumber,
        requestId,
        requesterEmail: auth.user.email,
        description: `${requestRecord.pickup} to ${requestRecord.destination || "campus drop-off"}`,
      });

      sendJson(response, 200, { url: session.url });
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

await ensureDataFile();

server.listen(4174, "127.0.0.1", () => {
  console.log("CampusConnect API running at http://127.0.0.1:4174 (local persistent fallback)");
});
