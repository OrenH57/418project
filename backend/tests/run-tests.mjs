import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "campus-connect-tests-"));
process.env.CAMPUSCONNECT_DATA_DIR = tempRoot;
process.env.CAMPUSCONNECT_DATA_FILE = path.join(tempRoot, "app-data.json");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { hashPassword, verifyPassword, sanitizeUser } = await import("../lib/auth.mjs");
const { dataFile, getAppUrl } = await import("../lib/config.mjs");
const { dataRepository, readData } = await import("../lib/store.mjs");
const { createMemoryDataAdapter } = await import("../lib/data/adapters.mjs");
const { createDataRepository } = await import("../lib/data/repository.mjs");
const {
  decoratePublicCourierRequest,
  expireTimedOutRequests,
  findRecentDuplicateRequest,
  findRecentSimilarSubmission,
  getCampusSnapshot,
} = await import("../lib/requests.mjs");
const { getDeliveryPricingForLocation } = await import("../lib/deliveryPricing.mjs");
const { buildPaymentTotal, formatPaymentAmount, parseOptionalTip } = await import("../lib/paymentPolicy.mjs");
const { verifyStripeWebhookPayload } = await import("../lib/payments.mjs");
const { buildAdminOverview } = await import("../lib/admin.mjs");
const { handlePaymentsRoute, handleRatingsRoute } = await import("../lib/routeGroups.mjs");
const { handleRequestRoute } = await import("../routes/requestRoutes.mjs");
const {
  IDEMPOTENCY_TTL_MS,
  createIdempotencyExpiry,
  createRequestFingerprint,
  normalizeIdempotencyKey,
} = await import("../lib/idempotency.mjs");

const results = [];

async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

await runTest("hashPassword and verifyPassword round-trip a valid password", async () => {
  const password = "demo1234";
  const hashed = hashPassword(password);

  assert.notEqual(hashed, password);
  assert.ok(hashed.includes(":"));
  assert.equal(verifyPassword(password, hashed), true);
  assert.equal(verifyPassword("wrong-pass", hashed), false);
});

await runTest("sanitizeUser returns stable booleans and safe public fields", async () => {
  const sanitized = sanitizeUser({
    id: "user-1",
    name: "Test User",
    email: "test@albany.edu",
    phone: undefined,
    role: "requester",
    courierMode: 0,
    ualbanyIdUploaded: "",
    ualbanyIdImage: undefined,
    foodSafetyVerified: 1,
    notificationsEnabled: null,
    courierOnline: "yes",
    bio: "hello",
    rating: 5,
    completedJobs: 2,
    earnings: 10,
    password: "secret",
  });

  assert.deepEqual(sanitized, {
    id: "user-1",
    name: "Test User",
    email: "test@albany.edu",
    phone: "",
    role: "requester",
    courierMode: 0,
    ualbanyIdUploaded: false,
    ualbanyIdImage: "",
    foodSafetyVerified: true,
    notificationsEnabled: false,
    courierOnline: true,
    bio: "hello",
    rating: 5,
    completedJobs: 2,
    earnings: 10,
  });
});

await runTest("vercel SPA rewrite covers app routes without swallowing API routes", async () => {
  const vercelConfigPath = path.join(repoRoot, "vercel.json");
  const vercelConfig = JSON.parse(await fs.readFile(vercelConfigPath, "utf8"));

  assert.deepEqual(vercelConfig.rewrites, [
    {
      source: "/((?!api(?:/|$)).*)",
      destination: "/index.html",
    },
  ]);
});

await runTest("readData normalizes older user placeholders and stored ID images", async () => {
  const fixture = {
    users: [
      {
        id: "legacy-user",
        name: "Legacy User",
        email: "legacy@albany.edu",
        password: "plainpass",
        role: "requester",
        ualbanyIdImage: "data:image/png;base64,abc123",
      },
    ],
    sessions: [],
    requests: [],
    messages: {},
    restaurants: [],
  };

  await fs.writeFile(dataFile, JSON.stringify(fixture, null, 2));
  const data = await readData();
  const user = data.users[0];

  assert.equal(user.phone, "518-555-0100");
  assert.equal(user.bio, "UAlbany student account.");
  assert.equal(user.rating, 5);
  assert.equal(user.completedJobs, 0);
  assert.equal(user.earnings, 0);
  assert.equal(user.ualbanyIdUploaded, true);
  assert.equal(user.notificationsEnabled, false);
  assert.equal(user.courierOnline, false);
  assert.equal(verifyPassword("plainpass", user.password), true);
  assert.ok(data.restaurants.includes("Kosher Dining Hall"));
});

await runTest("readData upgrades old demo credentials from demo123 to demo1234", async () => {
  const fixture = {
    users: [
      {
        id: "user-requester-1",
        name: "Ariana Green",
        email: "ariana.green@albany.edu",
        phone: "518-555-0141",
        password: "demo123",
        role: "requester",
        courierMode: false,
        ualbanyIdUploaded: false,
        ualbanyIdImage: "",
        foodSafetyVerified: false,
        notificationsEnabled: false,
        courierOnline: false,
        bio: "Legacy demo account.",
        rating: 4.8,
        completedJobs: 12,
        earnings: 0,
      },
    ],
    sessions: [],
    requests: [],
    messages: {},
    restaurants: [],
  };

  await fs.writeFile(dataFile, JSON.stringify(fixture, null, 2));
  const data = await readData();
  const demoUser = data.users[0];

  assert.equal(verifyPassword("demo1234", demoUser.password), true);
  assert.equal(verifyPassword("demo123", demoUser.password), false);
});

await runTest("readData defaults two-step completion fields on legacy requests", async () => {
  const fixture = {
    users: [],
    sessions: [],
    requests: [
      {
        id: "legacy-request",
        userId: "user-requester",
        requesterName: "Legacy Requester",
        serviceType: "food",
        pickup: "Starbucks",
        destination: "State Quad",
        time: "Now",
        payment: "4.99",
        notes: "",
        status: "accepted",
        acceptedBy: "user-courier",
        createdAt: new Date().toISOString(),
      },
    ],
    messages: {},
    restaurants: [],
  };

  await fs.writeFile(dataFile, JSON.stringify(fixture, null, 2));
  const data = await readData();
  const request = data.requests[0];

  assert.equal(request.deliveryConfirmedByCourier, false);
  assert.equal(request.deliveredAt, "");
  assert.equal(request.receivedConfirmedByRequester, false);
  assert.equal(request.receivedAt, "");
  assert.equal(request.completedAt, "");
});

await runTest("readData reports duplicate demo accounts without deleting them", async () => {
  const fixture = {
    users: [
      {
        id: "duplicate-demo-user",
        name: "Duplicate Ariana",
        email: "ARIANA.GREEN@ALBANY.EDU",
        phone: "518-555-0199",
        password: "demo1234",
        role: "requester",
        courierMode: false,
        ualbanyIdUploaded: false,
        ualbanyIdImage: "",
        foodSafetyVerified: false,
        notificationsEnabled: false,
        courierOnline: false,
        bio: "Duplicate account.",
        rating: 5,
        completedJobs: 0,
        earnings: 0,
      },
      {
        id: "user-requester-1",
        name: "Ariana Green",
        email: "ariana.green@albany.edu",
        phone: "518-555-0141",
        password: "demo1234",
        role: "requester",
        courierMode: false,
        ualbanyIdUploaded: false,
        ualbanyIdImage: "",
        foodSafetyVerified: false,
        notificationsEnabled: false,
        courierOnline: false,
        bio: "Canonical demo account.",
        rating: 4.8,
        completedJobs: 12,
        earnings: 0,
      },
    ],
    sessions: [{ token: "session-1", userId: "duplicate-demo-user" }],
    requests: [
      {
        id: "request-duplicate-user",
        userId: "duplicate-demo-user",
        requesterName: "Duplicate Ariana",
        serviceType: "food",
        pickup: "Baba's Pizza",
        destination: "State Quad",
        time: "Now",
        payment: "7",
        notes: "",
        status: "open",
        acceptedBy: null,
        createdAt: new Date().toISOString(),
      },
    ],
    ratings: [],
    messages: {
      "request-duplicate-user": [
        {
          id: "message-duplicate-user",
          senderId: "duplicate-demo-user",
          senderName: "Duplicate Ariana",
          text: "hello",
          createdAt: new Date().toISOString(),
        },
      ],
    },
    restaurants: [],
  };

  await fs.writeFile(dataFile, JSON.stringify(fixture, null, 2));
  const data = await readData();
  const duplicates = await dataRepository.findDuplicateUsers();

  assert.equal(data.users.filter((user) => user.email === "ariana.green@albany.edu").length, 2);
  assert.equal(data.users.some((user) => user.id === "duplicate-demo-user"), true);
  assert.deepEqual(duplicates.emails, [
    {
      email: "ariana.green@albany.edu",
      count: 2,
      userIds: ["duplicate-demo-user", "user-requester-1"],
    },
  ]);
  assert.equal(data.sessions[0].userId, "duplicate-demo-user");
  assert.equal(data.requests[0].userId, "duplicate-demo-user");
  assert.equal(data.messages["request-duplicate-user"][0].senderId, "duplicate-demo-user");
});

await runTest("repository reuses demo accounts across repeated seed setup", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [],
    sessions: [],
    requests: [],
    ratings: [],
    messages: {},
    restaurants: [],
  }));

  await repository.ensureSeedData();
  await repository.ensureSeedData();
  const data = await repository.readData();

  assert.equal(data.users.filter((user) => user.email === "ariana.green@albany.edu").length, 1);
  assert.equal(data.users.filter((user) => user.email === "marcus.hall@albany.edu").length, 1);
  assert.equal(data.users.filter((user) => user.email === "jordan.reyes@albany.edu").length, 1);
});

await runTest("repository rejects duplicate user email and id inserts", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [],
    sessions: [],
    requests: [],
    ratings: [],
    messages: {},
    restaurants: [],
  }));
  const user = {
    id: "duplicate-check-user",
    name: "Duplicate Check",
    email: "duplicate.check@albany.edu",
    password: hashPassword("demo1234"),
    role: "requester",
  };

  await repository.insertUser(user);
  await assert.rejects(() => repository.insertUser({ ...user, id: "other-user" }), { code: 11000 });
  await assert.rejects(() => repository.insertUser({ ...user, email: "other.email@albany.edu" }), { code: 11000 });
});

await runTest("repository keeps separate sessions for repeated login and logout", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [
      {
        id: "session-loop-user",
        name: "Session Loop",
        email: "session.loop@albany.edu",
        password: hashPassword("demo1234"),
        role: "requester",
      },
    ],
    sessions: [],
    requests: [],
    ratings: [],
    messages: {},
    restaurants: [],
  }));

  await repository.replaceUserSession("session-loop-user", {
    token: "first-token",
    userId: "session-loop-user",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await repository.replaceUserSession("session-loop-user", {
    token: "second-token",
    userId: "session-loop-user",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  assert.equal((await repository.findSessionByToken("first-token")).userId, "session-loop-user");
  assert.equal((await repository.findSessionByToken("second-token")).userId, "session-loop-user");
  await repository.deleteSessionByToken("second-token");
  assert.equal(await repository.findSessionByToken("second-token"), null);
});

await runTest("repository accepts a request only once atomically", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [],
    sessions: [],
    requests: [
      {
        id: "request-atomic-accept",
        userId: "requester-atomic",
        serviceType: "food",
        pickup: "Starbucks",
        destination: "State Quad",
        time: "Now",
        payment: "3.99",
        paymentStatus: "paid",
        status: "open",
        acceptedBy: null,
        moderationStatus: "clear",
        createdAt: new Date().toISOString(),
      },
    ],
    ratings: [],
    messages: {},
    restaurants: [],
  }));

  const first = await repository.acceptRequestAtomic("request-atomic-accept", "courier-one");
  const second = await repository.acceptRequestAtomic("request-atomic-accept", "courier-two");

  assert.equal(first.modifiedCount, 1);
  assert.equal(first.request.acceptedBy, "courier-one");
  assert.equal(second.modifiedCount, 0);
});

await runTest("repository appends messages without replacing the conversation", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [],
    sessions: [],
    requests: [],
    ratings: [],
    messages: {
      "request-chat": [{ id: "message-one", text: "first" }],
    },
    restaurants: [],
  }));

  await repository.appendMessage("request-chat", { id: "message-two", text: "second" });
  const data = await repository.readData();

  assert.deepEqual(data.messages["request-chat"].map((message) => message.id), ["message-one", "message-two"]);
});

await runTest("repository completes a request once and increments courier earnings once", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [
      {
        id: "courier-complete",
        name: "Courier Complete",
        email: "courier.complete@albany.edu",
        password: hashPassword("demo1234"),
        role: "courier",
        completedJobs: 0,
        earnings: 0,
      },
    ],
    sessions: [],
    requests: [
      {
        id: "request-complete-once",
        userId: "requester-complete",
        serviceType: "food",
        pickup: "Starbucks",
        destination: "State Quad",
        time: "Now",
        payment: "4.99",
        paymentStatus: "paid",
        status: "accepted",
        acceptedBy: "courier-complete",
        deliveryConfirmedByCourier: true,
        receivedConfirmedByRequester: false,
        moderationStatus: "clear",
        createdAt: new Date().toISOString(),
      },
    ],
    ratings: [],
    messages: {},
    restaurants: [],
  }));

  const first = await repository.confirmRequesterReceiptAtomic("request-complete-once", "requester-complete", {
    receivedConfirmedByRequester: true,
    receivedAt: new Date().toISOString(),
    status: "completed",
    completedAt: new Date().toISOString(),
    closedBy: "requester-complete",
  });
  const second = await repository.confirmRequesterReceiptAtomic("request-complete-once", "requester-complete", {
    receivedConfirmedByRequester: true,
  });
  const data = await repository.readData();
  const courier = data.users.find((user) => user.id === "courier-complete");

  assert.equal(first.modifiedCount, 1);
  assert.equal(second.modifiedCount, 0);
  assert.equal(courier.completedJobs, 1);
  assert.equal(courier.earnings, 4.99);
});

await runTest("Stripe webhook payload verification rejects bad signatures and accepts valid ones", async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  const rawBody = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test" } } });
  const timestamp = "1234567890";
  const signature = crypto
    .createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    assert.equal(
      verifyStripeWebhookPayload(rawBody, `t=${timestamp},v1=${signature}`).data.object.id,
      "cs_test",
    );
    assert.throws(() => verifyStripeWebhookPayload(rawBody, `t=${timestamp},v1=bad`), /invalid/);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    }
  }
});

await runTest("request route returns public-safe courier listings", async () => {
  const data = {
    users: [
      {
        id: "route-courier",
        name: "Route Courier",
        email: "route.courier@albany.edu",
        password: hashPassword("demo1234"),
        role: "courier",
        foodSafetyVerified: true,
      },
      {
        id: "route-requester",
        name: "Route Requester",
        email: "route.requester@albany.edu",
        password: hashPassword("demo1234"),
        role: "requester",
      },
    ],
    sessions: [],
    requests: [
      {
        id: "route-open-request",
        userId: "route-requester",
        requesterName: "Route Requester",
        serviceType: "food",
        pickup: "Starbucks",
        destination: "State Quad - Private details",
        deliveryLocationId: "state",
        deliveryLocationLabel: "State Quad",
        time: "Now",
        payment: "3.99",
        notes: "GET order #1234",
        status: "open",
        acceptedBy: null,
        paymentStatus: "paid",
        moderationStatus: "clear",
        createdAt: new Date().toISOString(),
      },
    ],
    ratings: [],
    messages: {},
    restaurants: [],
  };
  const calls = [];
  const context = {
    request: { method: "GET" },
    response: {},
    url: new URL("http://127.0.0.1:4174/api/requests?mode=courier"),
    requireUser: async () => ({ data, user: data.users[0] }),
    sendJson: (_response, statusCode, payload) => calls.push({ statusCode, payload }),
  };

  assert.equal(await handleRequestRoute(context), true);
  assert.equal(calls[0].statusCode, 200);
  assert.equal(calls[0].payload.requests[0].requesterName, "Customer");
  assert.equal(calls[0].payload.requests[0].destination, "State Quad");
  assert.equal(calls[0].payload.requests[0].notes, "");
});

await runTest("request route creates an order through the order service", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [
      {
        id: "route-order-requester",
        name: "Route Order Requester",
        email: "route.order.requester@albany.edu",
        password: hashPassword("demo1234"),
        role: "requester",
      },
    ],
    sessions: [],
    requests: [],
    ratings: [],
    messages: {},
    restaurants: [],
  }));
  const authData = await repository.readData();
  const calls = [];
  const context = {
    request: { method: "POST" },
    response: {},
    url: new URL("http://127.0.0.1:4174/api/requests"),
    requireUser: async () => ({ data: authData, user: authData.users[0] }),
    sendJson: (_response, statusCode, payload) => calls.push({ statusCode, payload }),
    readBody: async () => ({
      serviceType: "food",
      pickup: "Starbucks",
      destination: "Main Library - Main lobby",
      deliveryLocationId: "library",
      time: "Now",
      notes: "GET order screenshot uploaded.",
      orderScreenshot: "",
      tipAmount: "",
      startCheckout: false,
    }),
    dataRepository: repository,
    createStripeCheckoutSession: async () => {
      throw new Error("Stripe checkout should not start for this test.");
    },
    logBackendEvent: () => {},
  };

  assert.equal(await handleRequestRoute(context), true);
  assert.equal(calls[0].statusCode, 201);
  assert.equal(calls[0].payload.request.pickup, "Starbucks");
  assert.equal(calls[0].payload.request.payment, "3.99");

  const data = await repository.readData();
  assert.equal(data.requests.length, 1);
  assert.equal(data.requests[0].deliveryLocationId, "library");
  assert.equal(data.messages[data.requests[0].id][0].text, "Food delivery request posted for Starbucks.");
});

await runTest("readData removes expired and orphaned sessions", async () => {
  const fixture = {
    users: [
      {
        id: "session-user",
        name: "Session User",
        email: "session.user@albany.edu",
        phone: "518-555-0100",
        password: "plainpass",
        role: "requester",
        courierMode: false,
        ualbanyIdUploaded: false,
        ualbanyIdImage: "",
        foodSafetyVerified: false,
        notificationsEnabled: false,
        courierOnline: false,
        bio: "Session account.",
        rating: 5,
        completedJobs: 0,
        earnings: 0,
      },
    ],
    sessions: [
      {
        token: "valid-session",
        userId: "session-user",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      {
        token: "expired-session",
        userId: "session-user",
        createdAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        token: "orphan-session",
        userId: "missing-user",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    requests: [],
    ratings: [],
    messages: {},
    restaurants: [],
  };

  await fs.writeFile(dataFile, JSON.stringify(fixture, null, 2));
  const data = await readData();

  assert.deepEqual(data.sessions.map((session) => session.token), ["valid-session"]);
});

await runTest("repository normalizes data through a swappable in-memory adapter", async () => {
  const repository = createDataRepository(createMemoryDataAdapter({
    users: [
      {
        id: "memory-user",
        name: "Memory User",
        email: "MEMORY.USER@ALBANY.EDU",
        password: "plainpass",
        role: "requester",
      },
    ],
    sessions: [],
    requests: [],
    ratings: [],
    messages: {},
    restaurants: [],
  }));

  const data = await repository.readData();
  const user = data.users.find((entry) => entry.id === "memory-user");

  assert.equal(user.email, "memory.user@albany.edu");
  assert.equal(user.phone, "518-555-0100");
  assert.equal(user.authProvider, "password");
  assert.equal(verifyPassword("plainpass", user.password), true);
  assert.ok(data.restaurants.includes("Kosher Dining Hall"));
});

await runTest("findRecentDuplicateRequest catches repeated active order payloads", async () => {
  const existingRequest = {
    id: "request-existing",
    userId: "user-requester-1",
    serviceType: "food",
    pickup: "Baba's Pizza",
    destination: "State Quad",
    time: "Now",
    payment: "7",
    notes: "Order 123",
    orderEta: "10 minutes",
    orderScreenshot: "",
    status: "open",
    createdAt: new Date().toISOString(),
  };

  const duplicate = findRecentDuplicateRequest(
    [existingRequest],
    {
      ...existingRequest,
      id: "request-new",
      pickup: "  baba's   pizza ",
      destination: "state quad",
      createdAt: new Date().toISOString(),
    },
  );

  assert.equal(duplicate?.id, "request-existing");
});

await runTest("findRecentSimilarSubmission catches rapid retry with same core order", async () => {
  const existingRequest = {
    id: "request-existing-rapid",
    userId: "user-requester-1",
    serviceType: "food",
    pickup: "Baba's Pizza",
    destination: "Lecture Center - LC 1 - Meet outside classroom",
    deliveryLocationId: "lecture-center",
    time: "Now",
    payment: "4.99",
    notes: "first click",
    orderEta: "10 minutes",
    orderScreenshot: "",
    status: "open",
    createdAt: new Date(Date.now() - 5_000).toISOString(),
  };

  const rapidRetry = findRecentSimilarSubmission(
    [existingRequest],
    {
      ...existingRequest,
      id: "request-new-rapid",
      notes: "second click changed notes",
      orderEta: "",
      createdAt: new Date().toISOString(),
    },
  );
  const laterRetry = findRecentSimilarSubmission(
    [{ ...existingRequest, createdAt: new Date(Date.now() - 60_000).toISOString() }],
    {
      ...existingRequest,
      id: "request-later-rapid",
      createdAt: new Date().toISOString(),
    },
  );

  assert.equal(rapidRetry?.id, "request-existing-rapid");
  assert.equal(laterRetry, undefined);
});

await runTest("duplicate detection ignores admin removed active orders", async () => {
  const removedRequest = {
    id: "request-removed-duplicate",
    userId: "user-requester-1",
    serviceType: "food",
    pickup: "Baba's Pizza",
    destination: "State Quad",
    deliveryLocationId: "state",
    time: "Now",
    payment: "3.99",
    notes: "same order",
    orderEta: "",
    orderScreenshot: "",
    status: "open",
    moderationStatus: "removed",
    createdAt: new Date().toISOString(),
  };

  const duplicate = findRecentDuplicateRequest(
    [removedRequest],
    { ...removedRequest, id: "request-new-after-removal", moderationStatus: "clear" },
  );

  assert.equal(duplicate, undefined);
});

await runTest("campus snapshot excludes admin removed requests", async () => {
  const data = {
    users: [{ id: "courier-1", courierOnline: true }],
    requests: [
      {
        id: "visible-request",
        userId: "user-requester-1",
        serviceType: "food",
        pickup: "Baba's Pizza",
        destination: "State Quad",
        payment: "3.99",
        status: "open",
        moderationStatus: "clear",
        createdAt: "2026-04-22T17:00:00.000Z",
        notes: "",
      },
      {
        id: "removed-request",
        userId: "user-requester-1",
        serviceType: "food",
        pickup: "Starbucks",
        destination: "Dutch Quad",
        payment: "5.99",
        status: "open",
        moderationStatus: "removed",
        createdAt: "2026-04-22T18:00:00.000Z",
        notes: "",
      },
    ],
  };

  const snapshot = getCampusSnapshot(data, "user-requester-1");
  assert.equal(snapshot.openRequests, 1);
  assert.deepEqual(snapshot.myRecentRequests.map((request) => request.id), ["visible-request"]);
});

await runTest("expireTimedOutRequests deletes stale open orders only", async () => {
  const now = new Date("2026-04-26T14:00:00.000Z");
  const data = {
    requests: [
      {
        id: "request-stale-open",
        status: "open",
        createdAt: "2026-04-26T12:30:00.000Z",
      },
      {
        id: "request-stale-accepted",
        status: "accepted",
        createdAt: "2026-04-26T12:00:00.000Z",
      },
      {
        id: "request-fresh-open",
        status: "open",
        createdAt: "2026-04-26T13:30:00.000Z",
      },
    ],
    messages: {
      "request-stale-open": [{ id: "message-old" }],
      "request-stale-accepted": [{ id: "message-accepted" }],
    },
  };

  assert.equal(expireTimedOutRequests(data, now), true);
  assert.deepEqual(data.requests.map((request) => request.id), ["request-stale-accepted", "request-fresh-open"]);
  assert.equal(data.messages["request-stale-open"], undefined);
  assert.equal(data.messages["request-stale-accepted"].length, 1);
  assert.equal(data.requests[0].status, "accepted");
  assert.equal(data.requests[1].status, "open");
  assert.equal(expireTimedOutRequests(data, now), false);
});

await runTest("decoratePublicCourierRequest hides sensitive order details", async () => {
  const publicRequest = decoratePublicCourierRequest({
    id: "request-private",
    userId: "user-customer",
    requesterName: "Ariana Green",
    serviceType: "food",
    pickup: "Starbucks",
    destination: "Dutch Quad - Ten Broeck Hall - Front entrance",
    deliveryLocationId: "dutch-quad",
    deliveryLocationLabel: "Dutch Quad",
    time: "Now",
    payment: "4.99",
    basePayment: 3.99,
    tipAmount: 1,
    notes: "GET order #1234\nItems: latte and bagel",
    status: "open",
    acceptedBy: null,
    orderEta: "Ready at 12:15",
    orderScreenshot: "data:image/png;base64,aaaa",
    paymentStatus: "paid",
    flagged: false,
    moderationStatus: "clear",
    createdAt: new Date().toISOString(),
  });

  assert.equal(publicRequest.userId, "");
  assert.equal(publicRequest.requesterName, "Customer");
  assert.equal(publicRequest.requesterPhone, "");
  assert.equal(publicRequest.destination, "Dutch Quad");
  assert.equal(publicRequest.notes, "");
  assert.equal(publicRequest.orderEta, "");
  assert.equal(publicRequest.orderScreenshot, "");
  assert.equal(publicRequest.payment, "4.99");
  assert.equal(publicRequest.pickup, "Starbucks");
  assert.equal(publicRequest.deliveryConfirmedByCourier, false);
  assert.equal(publicRequest.deliveredAt, "");
  assert.equal(publicRequest.receivedConfirmedByRequester, false);
  assert.equal(publicRequest.receivedAt, "");
});

await runTest("admin overview includes visible listings and excludes removed listings", async () => {
  const data = {
    users: [],
    requests: [
      {
        id: "visible-listing",
        requesterName: "Visible Requester",
        pickup: "Baba's Pizza",
        destination: "State Quad",
        notes: "",
        payment: "3.99",
        status: "open",
        moderationStatus: "clear",
        createdAt: "2026-04-22T17:00:00.000Z",
      },
      {
        id: "removed-listing",
        requesterName: "Removed Requester",
        pickup: "Starbucks",
        destination: "Dutch Quad",
        notes: "",
        payment: "3.99",
        status: "open",
        moderationStatus: "removed",
        createdAt: "2026-04-22T18:00:00.000Z",
      },
    ],
  };

  const overview = buildAdminOverview(data, (entry) => entry);
  assert.deepEqual(overview.listings.map((entry) => entry.id), ["visible-listing"]);
  assert.deepEqual(overview.moderatedRequests.map((entry) => entry.id), ["removed-listing"]);
});

await runTest("delivery pricing validates and calculates supported campus locations", async () => {
  assert.deepEqual(getDeliveryPricingForLocation("library"), {
    ok: true,
    id: "library",
    label: "Main Library",
    fee: 3.99,
    payment: "3.99",
  });
  assert.deepEqual(getDeliveryPricingForLocation("lecture-center"), {
    ok: true,
    id: "lecture-center",
    label: "Lecture Center",
    fee: 3.99,
    payment: "3.99",
  });

  assert.equal(getDeliveryPricingForLocation("").ok, false);
  assert.equal(getDeliveryPricingForLocation("moon-base").ok, false);
});

await runTest("payment policy allows optional tips with cents", async () => {
  assert.deepEqual(parseOptionalTip(""), { ok: true, amount: 0 });
  assert.deepEqual(parseOptionalTip("3"), { ok: true, amount: 3 });
  assert.deepEqual(parseOptionalTip("0.50"), { ok: true, amount: 0.5 });
  assert.deepEqual(parseOptionalTip("3.50"), { ok: true, amount: 3.5 });
  assert.equal(parseOptionalTip("3.505").ok, false);
  assert.equal(parseOptionalTip("-1").ok, false);
  assert.equal(formatPaymentAmount(buildPaymentTotal(3.99, 2.5)), "6.49");
});

await runTest("app URL preserves configured deployment path for Stripe redirects", async () => {
  const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://example.com/418project/";

  try {
    assert.equal(
      getAppUrl({ headers: { origin: "https://example.com" } }),
      "https://example.com/418project",
    );
  } finally {
    if (previousPublicAppUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = previousPublicAppUrl;
    }
  }
});

await runTest("app URL applies Vite base path when PUBLIC_APP_URL is not set", async () => {
  const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
  const previousBasePath = process.env.VITE_BASE_PATH;
  delete process.env.PUBLIC_APP_URL;
  process.env.VITE_BASE_PATH = "/418project/";

  try {
    assert.equal(
      getAppUrl({ headers: { origin: "https://example.com" } }),
      "https://example.com/418project",
    );
  } finally {
    if (previousPublicAppUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = previousPublicAppUrl;
    }

    if (previousBasePath === undefined) {
      delete process.env.VITE_BASE_PATH;
    } else {
      process.env.VITE_BASE_PATH = previousBasePath;
    }
  }
});

await runTest("Stripe payment confirmation can sync a stored pending session", async () => {
  const data = {
    users: [
      {
        id: "payment-requester",
        name: "Payment Requester",
        email: "payment.requester@albany.edu",
        password: hashPassword("demo1234"),
        role: "requester",
      },
    ],
    sessions: [],
    requests: [
      {
        id: "request-payment-pending",
        userId: "payment-requester",
        requesterName: "Payment Requester",
        serviceType: "food",
        pickup: "Baba's Pizza",
        destination: "State Quad",
        time: "Now",
        payment: "3.99",
        notes: "",
        status: "accepted",
        acceptedBy: "payment-courier",
        paymentStatus: "pending",
        paidAt: "",
        stripeCheckoutSessionId: "cs_test_paid",
        createdAt: new Date().toISOString(),
      },
    ],
    ratings: [],
    messages: {},
    restaurants: [],
  };
  const calls = [];
  let wroteData = false;
  const context = {
    request: { method: "POST" },
    response: {},
    url: new URL("http://127.0.0.1:4174/api/payments/confirm"),
    requireUser: async () => ({ data, user: data.users[0] }),
    sendJson: (_response, statusCode, payload) => calls.push({ statusCode, payload }),
    readBody: async () => ({ requestId: "request-payment-pending", paymentState: "success" }),
    writeData: async () => {
      wroteData = true;
    },
    decorateRequest: (requestRecord) => requestRecord,
    getStripeCheckoutSession: async (sessionId) => {
      assert.equal(sessionId, "cs_test_paid");
      return { payment_status: "paid" };
    },
  };

  assert.equal(await handlePaymentsRoute(context), true);
  assert.equal(wroteData, true);
  assert.equal(data.requests[0].paymentStatus, "paid");
  assert.ok(data.requests[0].paidAt);
  assert.equal(data.messages["request-payment-pending"][0].text, "Payment was completed in Stripe Checkout.");
  assert.equal(calls[0].statusCode, 200);
  assert.equal(calls[0].payload.request.paymentStatus, "paid");
});

await runTest("minimum payment plus tip keeps the base price locked", async () => {
  assert.equal(formatPaymentAmount(buildPaymentTotal(3.99, 0)), "3.99");
  assert.equal(formatPaymentAmount(buildPaymentTotal(3.99, 0.25)), "4.24");
});

await runTest("location delivery price plus tip keeps the selected location price", async () => {
  const lectureCenterPricing = getDeliveryPricingForLocation("lecture-center");

  assert.equal(lectureCenterPricing.ok, true);
  assert.equal(formatPaymentAmount(buildPaymentTotal(lectureCenterPricing.fee, 0)), "3.99");
  assert.equal(formatPaymentAmount(buildPaymentTotal(lectureCenterPricing.fee, 1.25)), "5.24");
});

await runTest("food duplicate detection uses explicit location and ignores recalculated price", async () => {
  const existingRequest = {
    id: "request-existing-food",
    userId: "user-requester-1",
    serviceType: "food",
    pickup: "Baba's Pizza",
    destination: "Main Library - Main Library - Main lobby",
    deliveryLocationId: "library",
    time: "Now",
    payment: "3.99",
    notes: "GET order screenshot uploaded.",
    orderEta: "",
    orderScreenshot: "data:image/png;base64,abc",
    status: "open",
    createdAt: new Date().toISOString(),
  };

  const duplicate = findRecentDuplicateRequest(
    [existingRequest],
    {
      ...existingRequest,
      id: "request-new-food",
      payment: "9.99",
      createdAt: new Date().toISOString(),
    },
  );

  const differentLocation = findRecentDuplicateRequest(
    [existingRequest],
    {
      ...existingRequest,
      id: "request-different-location",
      deliveryLocationId: "empire",
      createdAt: new Date().toISOString(),
    },
  );

  assert.equal(duplicate?.id, "request-existing-food");
  assert.equal(differentLocation, undefined);
});

await runTest("idempotency helpers normalize keys and fingerprint retry payloads", async () => {
  const payload = {
    idempotencyKey: "first-key",
    serviceType: "food",
    pickup: "Baba's Pizza",
    destination: "Lecture Center - LC 1 - Meet outside classroom",
    deliveryLocationId: "lecture-center",
  };
  const retryPayload = { ...payload, idempotencyKey: "retry-key" };
  const now = new Date("2026-04-26T12:00:00.000Z");

  assert.equal(normalizeIdempotencyKey("  abc-123  "), "abc-123");
  assert.equal(normalizeIdempotencyKey("x".repeat(121)), "");
  assert.equal(createRequestFingerprint(payload), createRequestFingerprint(retryPayload));
  assert.equal(createIdempotencyExpiry(now).getTime(), now.getTime() + IDEMPOTENCY_TTL_MS);
});

await runTest("ratings cannot be submitted before a request is completed", async () => {
  const data = {
    users: [
      {
        id: "rating-requester",
        name: "Rating Requester",
        email: "rating.requester@albany.edu",
        password: hashPassword("demo1234"),
        role: "requester",
      },
      {
        id: "rating-courier",
        name: "Rating Courier",
        email: "rating.courier@albany.edu",
        password: hashPassword("demo1234"),
        role: "courier",
      },
    ],
    sessions: [],
    requests: [
      {
        id: "request-rating-pending",
        userId: "rating-requester",
        requesterName: "Rating Requester",
        serviceType: "food",
        pickup: "Baba's Pizza",
        destination: "State Quad",
        time: "Now",
        payment: "3.99",
        notes: "",
        status: "accepted",
        acceptedBy: "rating-courier",
        createdAt: new Date().toISOString(),
      },
    ],
    ratings: [],
    messages: {},
    restaurants: [],
  };
  const calls = [];
  const context = {
    request: { method: "POST" },
    response: {},
    url: new URL("http://127.0.0.1:4174/api/ratings/request-rating-pending"),
    requireUser: async () => ({ data, user: data.users[0] }),
    sendJson: (_response, statusCode, payload) => calls.push({ statusCode, payload }),
    readBody: async () => ({ rating: 5, comment: "Early rating" }),
    canAccessRequest: () => true,
    writeData: async () => {},
  };

  assert.equal(await handleRatingsRoute(context), true);
  assert.deepEqual(calls, [
    {
      statusCode: 400,
      payload: { error: "You can rate this request after it is marked complete." },
    },
  ]);
  assert.equal(data.ratings.length, 0);
});

await fs.rm(tempRoot, { recursive: true, force: true });

for (const result of results) {
  if (result.ok) {
    console.log(`PASS ${result.name}`);
  } else {
    console.error(`FAIL ${result.name}`);
    console.error(result.error);
  }
}

const failed = results.filter((result) => !result.ok).length;
if (failed) {
  process.exitCode = 1;
} else {
  console.log(`\n${results.length} tests passed`);
}
