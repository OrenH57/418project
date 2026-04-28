// File purpose:
// Central data normalization shared by all persistence adapters.

import { DISCOUNT_RATE, ualbanyRestaurants } from "../config.mjs";
import { hashPassword, verifyPassword } from "../auth.mjs";
import { demoUsers } from "./seed.mjs";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpiredSession(session) {
  if (!session?.expiresAt) {
    return false;
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export function normalizeDataRelationships(data) {
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

  const normalizedUsers = [];

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

    normalizedUsers.push(user);
  }

  if (normalizedUsers.length !== data.users.length) {
    data.users = normalizedUsers;
    changed = true;
  }

  const validUserIds = new Set(data.users.map((user) => user.id));
  const seenTokens = new Set();
  const normalizedSessions = [];

  for (const session of data.sessions) {
    if (!session?.token || !validUserIds.has(session.userId) || seenTokens.has(session.token)) {
      changed = true;
      continue;
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

export function normalizeDataSnapshot(data) {
  let changed = false;
  changed = normalizeDataRelationships(data) || changed;

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

  if (JSON.stringify(data.restaurants || []) !== JSON.stringify(ualbanyRestaurants)) {
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
    if (typeof request.deliveryConfirmedByCourier !== "boolean") {
      request.deliveryConfirmedByCourier = false;
      changed = true;
    }
    if (typeof request.deliveredAt !== "string") {
      request.deliveredAt = "";
      changed = true;
    }
    if (typeof request.receivedConfirmedByRequester !== "boolean") {
      request.receivedConfirmedByRequester = false;
      changed = true;
    }
    if (typeof request.receivedAt !== "string") {
      request.receivedAt = "";
      changed = true;
    }
    if (typeof request.completedAt !== "string") {
      request.completedAt = "";
      changed = true;
    }
    if (typeof request.cancelledAt !== "string") {
      request.cancelledAt = "";
      changed = true;
    }
    if (typeof request.expiredAt !== "string") {
      request.expiredAt = "";
      changed = true;
    }
    if (typeof request.closedBy !== "string") {
      request.closedBy = "";
      changed = true;
    }
    if (typeof request.deliveryLocationId !== "string") {
      request.deliveryLocationId = "";
      changed = true;
    }
    if (typeof request.deliveryLocationLabel !== "string") {
      request.deliveryLocationLabel = "";
      changed = true;
    }
    if (
      typeof request.tipAmount !== "number" ||
      !Number.isFinite(request.tipAmount) ||
      request.tipAmount < 0
    ) {
      request.tipAmount = 0;
      changed = true;
    } else if (request.tipAmount !== Number(request.tipAmount.toFixed(2))) {
      request.tipAmount = Number(request.tipAmount.toFixed(2));
      changed = true;
    }
    if (
      request.basePayment !== null &&
      (typeof request.basePayment !== "number" || !Number.isFinite(request.basePayment) || request.basePayment <= 0)
    ) {
      const parsedPayment = Number.parseFloat(request.payment || "0");
      request.basePayment = Number.isFinite(parsedPayment)
        ? Number((parsedPayment - request.tipAmount).toFixed(2))
        : null;
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

  return changed;
}
