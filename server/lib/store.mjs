// File purpose:
// Local JSON persistence and seed normalization for the prototype backend.

import fs from "node:fs/promises";
import { dataDir, dataFile, DISCOUNT_RATE, ualbanyRestaurants } from "./config.mjs";
import { hashPassword } from "./auth.mjs";

export const seedData = {
  users: [
    {
      id: "user-requester-1",
      name: "Ariana Green",
      email: "ariana.green@albany.edu",
      phone: "518-555-0141",
      password: hashPassword("demo123"),
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
