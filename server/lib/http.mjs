// File purpose:
// Shared HTTP helpers for responses, body parsing, and auth lookups.

import { readData } from "./store.mjs";

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

export async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function getToken(request) {
  const authorization = request.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7);
  }
  return "";
}

export async function requireUser(request, response) {
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
