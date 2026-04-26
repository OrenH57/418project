import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "campus-connect-tests-"));
process.env.CAMPUSCONNECT_DATA_DIR = tempRoot;
process.env.CAMPUSCONNECT_DATA_FILE = path.join(tempRoot, "app-data.json");

const { hashPassword, verifyPassword, sanitizeUser } = await import("../lib/auth.mjs");
const { dataFile } = await import("../lib/config.mjs");
const { readData } = await import("../lib/store.mjs");
const { findRecentDuplicateRequest } = await import("../lib/requests.mjs");

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

await runTest("readData deduplicates demo accounts and rewires related records", async () => {
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

  assert.equal(data.users.filter((user) => user.email === "ariana.green@albany.edu").length, 1);
  assert.equal(data.users.some((user) => user.id === "duplicate-demo-user"), false);
  assert.equal(data.sessions[0].userId, "user-requester-1");
  assert.equal(data.requests[0].userId, "user-requester-1");
  assert.equal(data.messages["request-duplicate-user"][0].senderId, "user-requester-1");
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
