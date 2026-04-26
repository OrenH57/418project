// File purpose:
// Shared backend config, env loading, and app constants.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const serverDir = path.resolve(__dirname, "..");
export const dataDir = process.env.CAMPUSCONNECT_DATA_DIR || path.join(serverDir, "data");
export const dataFile = process.env.CAMPUSCONNECT_DATA_FILE || path.join(dataDir, "app-data.json");
export const rootDir = path.resolve(serverDir, "..");

export const ualbanyRestaurants = [
  "Baba's Pizza",
  "Damor Chai Cafe",
  "Fiamma",
  "Greens To Go",
  "Jamals Chicken",
  "Kosher Dining Hall",
  "Nikos Cafe",
  "Starbucks",
  "The Corner Deli",
  "The Halal Shack",
  "The Spread",
  "Yellas",
  "Zoca",
];
export const MIN_PAYMENT_OFFER = 3.99;
export const DISCOUNT_RATE = 0.4;

export async function loadEnv() {
  const loadedKeys = new Set();

  for (const envName of [".env", ".env.local"]) {
    try {
      const raw = await fs.readFile(path.join(rootDir, envName), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separator = trimmed.indexOf("=");
        if (separator === -1) continue;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();

        // Keep real shell-provided environment variables highest priority,
        // but let .env.local override values that came from .env.
        if (!(key in process.env) || loadedKeys.has(key)) {
          process.env[key] = value;
          loadedKeys.add(key);
        }
      }
    } catch {
      // optional env file
    }
  }
}

export function getAppUrl() {
  return process.env.PUBLIC_APP_URL || "http://127.0.0.1:4173";
}

export function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}

export function getStripePublishableKey() {
  return process.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
}

export function getAzureClientId() {
  return process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "";
}

export function getAzureTenantId() {
  return process.env.AZURE_TENANT_ID || process.env.VITE_AZURE_TENANT_ID || "";
}
