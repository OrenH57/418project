// File purpose:
// Shared backend config, env loading, and app constants.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const serverDir = path.resolve(__dirname, "..");
export const dataDir = path.join(serverDir, "data");
export const dataFile = path.join(dataDir, "app-data.json");
export const rootDir = path.resolve(serverDir, "..");

export const ualbanyRestaurants = [
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

export const APP_URL = process.env.PUBLIC_APP_URL || "http://127.0.0.1:4173";
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const MIN_PAYMENT_OFFER = 4;
export const DISCOUNT_RATE = 0.4;

export async function loadEnv() {
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
