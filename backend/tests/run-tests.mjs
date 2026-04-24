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
