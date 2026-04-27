import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "campus-connect-tests-"));
process.env.CAMPUSCONNECT_DATA_DIR = tempRoot;
process.env.CAMPUSCONNECT_DATA_FILE = path.join(tempRoot, "app-data.json");

const { hashPassword, verifyPassword, sanitizeUser } = await import("../lib/auth.mjs");
const { dataFile } = await import("../lib/config.mjs");
const { dataRepository, readData } = await import("../lib/store.mjs");
const { createMemoryDataAdapter } = await import("../lib/data/adapters.mjs");
const { createDataRepository } = await import("../lib/data/repository.mjs");
const { expireTimedOutRequests, findRecentDuplicateRequest, findRecentSimilarSubmission } = await import("../lib/requests.mjs");
const { getDeliveryPricingForLocation } = await import("../lib/deliveryPricing.mjs");
const { buildPaymentTotal, formatPaymentAmount, parseOptionalTip } = await import("../lib/paymentPolicy.mjs");
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

await runTest("repository replaces sessions for repeated login and logout", async () => {
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

  assert.equal(await repository.findSessionByToken("first-token"), null);
  assert.equal((await repository.findSessionByToken("second-token")).userId, "session-loop-user");
  await repository.deleteSessionByToken("second-token");
  assert.equal(await repository.findSessionByToken("second-token"), null);
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
