// File purpose:
// Business-facing repository wrapper over swappable storage adapters.

import { ualbanyRestaurants } from "../config.mjs";
import { createIdempotencyExpiry } from "../idempotency.mjs";
import { demoUsers, seedData } from "./seed.mjs";
import { normalizeDataSnapshot } from "./normalize.mjs";
import { expireTimedOutRequests } from "../requests.mjs";

export function createDataRepository(adapter, { log = () => {} } = {}) {
  let userUniqueIndexesReady = true;

  async function readData() {
    const data = await adapter.readSnapshot();
    data.restaurants = ualbanyRestaurants;

    const normalized = normalizeDataSnapshot(data);
    const expired = expireTimedOutRequests(data);
    const changed = normalized || expired;

    if (changed && adapter.canWriteNormalizedSnapshots !== false) {
      await adapter.writeSnapshot(data);
    }

    return data;
  }

  async function writeData(data) {
    await adapter.writeSnapshot(data);
  }

  async function ensureSeedData() {
    const duplicateUsers = adapter.findDuplicateUsers
      ? await adapter.findDuplicateUsers()
      : { emails: [], ids: [] };
    const hasDuplicateUsers = duplicateUsers.emails.length > 0 || duplicateUsers.ids.length > 0;

    if (hasDuplicateUsers) {
      log("data_integrity.duplicate_users_found", {
        duplicateEmails: duplicateUsers.emails,
        duplicateIds: duplicateUsers.ids,
      });
    }

    if (adapter.ensureIndexes) {
      const indexStatus = await adapter.ensureIndexes({ skipUserUniqueIndexes: hasDuplicateUsers });
      userUniqueIndexesReady = indexStatus?.userUniqueIndexesReady !== false;
      if (hasDuplicateUsers) {
        log("data_integrity.user_unique_indexes_skipped", {
          reason: "Existing duplicate users must be reviewed before creating unique indexes.",
        });
      }
    }

    for (const user of demoUsers) {
      const result = await adapter.upsertDemoUser(user);
      log(result.created ? "demo_account.created" : "demo_account.exists", {
        userId: user.id,
        email: user.email,
      });
    }

    if ((await adapter.countRequests()) === 0) {
      await adapter.insertSeedData(seedData);
    }

    await readData();
  }

  async function replaceUserSession(userId, session) {
    const result = await adapter.replaceSessionsForUser(userId, session);
    log("session.created", {
      userId,
      previousSessionCount: result.previousSessionCount || 0,
      expiresAt: session.expiresAt,
    });
    return session;
  }

  async function insertUser(user) {
    if (!userUniqueIndexesReady) {
      const error = new Error("User creation is temporarily disabled until duplicate existing accounts are resolved.");
      error.code = "USER_UNIQUE_INDEXES_UNAVAILABLE";
      throw error;
    }

    return await adapter.insertUser(user);
  }

  async function reserveIdempotencyRecord(record) {
    return await adapter.reserveIdempotencyRecord(record);
  }

  async function completeIdempotencyRecord({ userId, key, statusCode, payload }) {
    if (!key) return;
    await adapter.completeIdempotencyRecord({
      userId,
      key,
      updates: {
        status: "completed",
        responseStatus: statusCode,
        responsePayload: payload,
        completedAt: new Date(),
        expiresAt: createIdempotencyExpiry(),
      },
    });
  }

  return {
    adapter,
    readData,
    writeData,
    ensureSeedData,
    findDuplicateUsers: () => adapter.findDuplicateUsers?.() ?? { emails: [], ids: [] },
    replaceUserSession,
    findUserByEmail: (email) => adapter.findUserByEmail(email),
    insertUser,
    updateUserById: (userId, updates) => adapter.updateUserById(userId, updates),
    findSessionByToken: (token) => adapter.findSessionByToken(token),
    deleteSessionByToken: (token) => adapter.deleteSessionByToken(token),
    reserveIdempotencyRecord,
    findIdempotencyRecord: (userId, key) => adapter.findIdempotencyRecord(userId, key),
    completeIdempotencyRecord,
    deleteIdempotencyRecord: (userId, key) => adapter.deleteIdempotencyRecord(userId, key),
    acquireOrderCreationLock: (userId, expiresAt) => adapter.acquireOrderCreationLock(userId, expiresAt),
    releaseOrderCreationLock: (userId) => adapter.releaseOrderCreationLock(userId),
    findActiveRequestsByUser: (userId) => adapter.findActiveRequestsByUser(userId),
    countActiveRequestsByUser: (userId) => adapter.countActiveRequestsByUser(userId),
    insertRequest: (requestRecord) => adapter.insertRequest(requestRecord),
    updateRequestById: (requestId, updates) => adapter.updateRequestById(requestId, updates),
    deleteRequestById: (requestId) => adapter.deleteRequestById(requestId),
    insertMessages: (requestId, messages) => adapter.insertMessages(requestId, messages),
    deleteMessagesByRequestId: (requestId) => adapter.deleteMessagesByRequestId(requestId),
  };
}
