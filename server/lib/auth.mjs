// File purpose:
// Password, token, and user-auth helpers for the local backend.

import crypto from "node:crypto";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedPassword) {
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

export function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function isCampusEmail(email) {
  return email.endsWith(".edu") || email.endsWith("@albany.edu");
}

export function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
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
