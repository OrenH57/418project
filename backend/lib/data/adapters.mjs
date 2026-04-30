// File purpose:
// Storage adapters for repository-backed data access.

import fs from "node:fs/promises";
import path from "node:path";
import { cloneSeedData } from "./seed.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toMessageDocs(messages = {}) {
  return Object.entries(messages).map(([requestId, requestMessages]) => ({
    requestId,
    messages: Array.isArray(requestMessages)
      ? requestMessages.map(({ _id, ...rest }) => rest)
      : [],
  }));
}

function fromMessageDocs(messageDocs = []) {
  const messages = {};
  for (const doc of messageDocs) {
    messages[doc.requestId] = Array.isArray(doc.messages) ? doc.messages : [];
  }
  return messages;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function findDuplicateUserGroups(users = []) {
  const byEmail = new Map();
  const byId = new Map();

  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (email) {
      byEmail.set(email, [...(byEmail.get(email) || []), user]);
    }
    if (user.id) {
      byId.set(user.id, [...(byId.get(user.id) || []), user]);
    }
  }

  return {
    emails: [...byEmail.entries()]
      .filter(([, usersForEmail]) => usersForEmail.length > 1)
      .map(([email, usersForEmail]) => ({
        email,
        count: usersForEmail.length,
        userIds: usersForEmail.map((user) => user.id || ""),
      })),
    ids: [...byId.entries()]
      .filter(([, usersForId]) => usersForId.length > 1)
      .map(([id, usersForId]) => ({
        id,
        count: usersForId.length,
        emails: usersForId.map((user) => normalizeEmail(user.email)),
      })),
  };
}

export function createMemoryDataAdapter(initialData = cloneSeedData()) {
  let state = clone(initialData);
  const idempotencyRecords = [];
  const orderLocks = [];

  return {
    async readSnapshot() {
      return clone(state);
    },
    async writeSnapshot(data) {
      state = clone(data);
    },
    async ensureIndexes() {},
    canWriteNormalizedSnapshots: true,
    async findDuplicateUsers() {
      return findDuplicateUserGroups(state.users);
    },
    async reset(data = cloneSeedData()) {
      state = clone(data);
      idempotencyRecords.length = 0;
      orderLocks.length = 0;
    },
    async upsertDemoUser(user) {
      const email = normalizeEmail(user.email);
      const index = state.users.findIndex((entry) => normalizeEmail(entry.email) === email || entry.id === user.id);
      if (index >= 0) {
        state.users[index] = { ...state.users[index], ...clone(user), id: state.users[index].id, email };
        return { created: false };
      }
      state.users.push({ ...clone(user), email });
      return { created: true };
    },
    async countRequests() {
      return state.requests.length;
    },
    async insertSeedData(seedData) {
      if (seedData.sessions?.length) state.sessions.push(...clone(seedData.sessions));
      if (seedData.requests?.length) state.requests.push(...clone(seedData.requests));
      if (seedData.ratings?.length) state.ratings.push(...clone(seedData.ratings));
      for (const [requestId, messages] of Object.entries(seedData.messages || {})) {
        state.messages[requestId] = clone(messages);
      }
    },
    async findUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      return clone(state.users.find((user) => normalizeEmail(user.email) === normalizedEmail) || null);
    },
    async insertUser(user) {
      const email = normalizeEmail(user.email);
      if (state.users.some((entry) => normalizeEmail(entry.email) === email || entry.id === user.id)) {
        const error = new Error("Duplicate user");
        error.code = 11000;
        error.keyPattern = state.users.some((entry) => normalizeEmail(entry.email) === email) ? { email: 1 } : { id: 1 };
        throw error;
      }
      state.users.push({ ...clone(user), email });
    },
    async updateUserById(userId, updates) {
      const user = state.users.find((entry) => entry.id === userId);
      if (!user) return { matchedCount: 0 };
      Object.assign(user, clone(updates));
      return { matchedCount: 1 };
    },
    async createSessionForUser(userId, session) {
      const previousSessionCount = state.sessions.filter((entry) => entry.userId === userId).length;
      state.sessions.push(clone(session));
      return { previousSessionCount };
    },
    async findSessionByToken(token) {
      return clone(state.sessions.find((session) => session.token === token) || null);
    },
    async deleteSessionByToken(token) {
      const before = state.sessions.length;
      state.sessions = state.sessions.filter((session) => session.token !== token);
      return { deletedCount: before - state.sessions.length };
    },
    async reserveIdempotencyRecord(record) {
      const existing = idempotencyRecords.find((entry) => entry.userId === record.userId && entry.key === record.key);
      if (existing) {
        return { reserved: false, record: clone(existing) };
      }
      idempotencyRecords.push(clone(record));
      return { reserved: true, record: clone(record) };
    },
    async findIdempotencyRecord(userId, key) {
      return clone(idempotencyRecords.find((entry) => entry.userId === userId && entry.key === key) || null);
    },
    async completeIdempotencyRecord({ userId, key, updates }) {
      const record = idempotencyRecords.find((entry) => entry.userId === userId && entry.key === key);
      if (record) Object.assign(record, clone(updates));
    },
    async deleteIdempotencyRecord(userId, key) {
      const index = idempotencyRecords.findIndex((entry) => entry.userId === userId && entry.key === key);
      if (index >= 0) idempotencyRecords.splice(index, 1);
    },
    async acquireOrderCreationLock(userId, expiresAt) {
      if (orderLocks.some((lock) => lock.userId === userId)) return false;
      orderLocks.push({ userId, createdAt: new Date(), expiresAt });
      return true;
    },
    async releaseOrderCreationLock(userId) {
      const index = orderLocks.findIndex((lock) => lock.userId === userId);
      if (index >= 0) orderLocks.splice(index, 1);
    },
    async findActiveRequestsByUser(userId) {
      return clone(state.requests.filter((request) =>
        request.userId === userId &&
        request.moderationStatus !== "removed" &&
        ["open", "accepted"].includes(request.status)
      ));
    },
    async countActiveRequestsByUser(userId) {
      return state.requests.filter((request) =>
        request.userId === userId &&
        request.moderationStatus !== "removed" &&
        ["open", "accepted"].includes(request.status)
      ).length;
    },
    async insertRequest(requestRecord) {
      state.requests.push(clone(requestRecord));
    },
    async updateRequestById(requestId, updates) {
      const request = state.requests.find((entry) => entry.id === requestId);
      if (request) Object.assign(request, clone(updates));
      return { matchedCount: request ? 1 : 0, modifiedCount: request ? 1 : 0 };
    },
    async flagRequestsForSuspendedUser(userId, reason) {
      let modifiedCount = 0;
      for (const request of state.requests) {
        if (request.userId !== userId && request.acceptedBy !== userId) continue;
        request.flagged = true;
        request.flaggedReason = reason;
        if (request.moderationStatus === "clear") {
          request.moderationStatus = "flagged";
        }
        modifiedCount += 1;
      }
      return { modifiedCount };
    },
    async findRequestById(requestId) {
      return clone(state.requests.find((entry) => entry.id === requestId) || null);
    },
    async acceptRequestAtomic(requestId, courierId) {
      const request = state.requests.find((entry) =>
        entry.id === requestId &&
        entry.status === "open" &&
        !entry.acceptedBy &&
        entry.userId !== courierId &&
        entry.moderationStatus !== "removed"
      );
      if (!request) return { modifiedCount: 0, request: null };
      request.status = "accepted";
      request.acceptedBy = courierId;
      return { modifiedCount: 1, request: clone(request) };
    },
    async cancelRequestAtomic(requestId, userId, updates) {
      const request = state.requests.find((entry) =>
        entry.id === requestId &&
        entry.userId === userId &&
        ["open", "accepted"].includes(entry.status) &&
        !["paid", "pending"].includes(entry.paymentStatus)
      );
      if (!request) return { modifiedCount: 0, request: null };
      Object.assign(request, clone(updates));
      return { modifiedCount: 1, request: clone(request) };
    },
    async confirmCourierDeliveryAtomic(requestId, courierId, updates) {
      const request = state.requests.find((entry) =>
        entry.id === requestId &&
        entry.acceptedBy === courierId &&
        entry.status === "accepted" &&
        entry.paymentStatus === "paid" &&
        !entry.deliveryConfirmedByCourier
      );
      if (!request) return { modifiedCount: 0, request: null };
      Object.assign(request, clone(updates));
      return { modifiedCount: 1, request: clone(request) };
    },
    async confirmRequesterReceiptAtomic(requestId, requesterId, updates) {
      const request = state.requests.find((entry) =>
        entry.id === requestId &&
        entry.userId === requesterId &&
        entry.status === "accepted" &&
        entry.paymentStatus === "paid" &&
        entry.deliveryConfirmedByCourier &&
        !entry.receivedConfirmedByRequester
      );
      if (!request) return { modifiedCount: 0, request: null };
      Object.assign(request, clone(updates));
      if (request.status === "completed" && request.acceptedBy) {
        const courier = state.users.find((entry) => entry.id === request.acceptedBy);
        if (courier) {
          const earnings =
            request.serviceType === "discount" && typeof request.runnerEarnings === "number"
              ? request.runnerEarnings
              : Number.parseFloat(request.payment || "0");
          courier.completedJobs = Number(courier.completedJobs || 0) + 1;
          courier.earnings = Number((Number(courier.earnings || 0) + (Number.isFinite(earnings) ? earnings : 0)).toFixed(2));
        }
      }
      return { modifiedCount: 1, request: clone(request) };
    },
    async deleteRequestById(requestId) {
      state.requests = state.requests.filter((request) => request.id !== requestId);
    },
    async deleteRequestsByIds(requestIds) {
      const ids = new Set(requestIds);
      state.requests = state.requests.filter((request) => !ids.has(request.id));
    },
    async insertMessages(requestId, messages) {
      state.messages[requestId] = clone(messages);
    },
    async appendMessage(requestId, message) {
      state.messages[requestId] = state.messages[requestId] || [];
      state.messages[requestId].push(clone(message));
    },
    async upsertRatingAndRecalculate(ratingRecord) {
      const index = state.ratings.findIndex(
        (entry) => entry.requestId === ratingRecord.requestId && entry.authorUserId === ratingRecord.authorUserId,
      );
      if (index >= 0) {
        state.ratings[index] = clone(ratingRecord);
      } else {
        state.ratings.push(clone(ratingRecord));
      }

      const userRatings = state.ratings.filter((entry) => entry.targetUserId === ratingRecord.targetUserId);
      const averageRating = userRatings.reduce((total, entry) => total + entry.rating, 0) / userRatings.length;
      const targetUser = state.users.find((entry) => entry.id === ratingRecord.targetUserId);
      if (targetUser) targetUser.rating = Number(averageRating.toFixed(1));
      return { rating: clone(ratingRecord), targetUser: clone(targetUser || null) };
    },
    async markRequestPaidByCheckoutSession(checkoutSessionId, updates) {
      const request = state.requests.find((entry) =>
        entry.stripeCheckoutSessionId === checkoutSessionId &&
        entry.paymentStatus !== "paid"
      );
      if (!request) return { modifiedCount: 0, request: null };
      Object.assign(request, clone(updates));
      return { modifiedCount: 1, request: clone(request) };
    },
    async deleteMessagesByRequestId(requestId) {
      delete state.messages[requestId];
    },
    async deleteMessagesByRequestIds(requestIds) {
      for (const requestId of requestIds) {
        delete state.messages[requestId];
      }
    },
  };
}

export function createTempFileDataAdapter({ dataFile, seedData = cloneSeedData() }) {
  const memory = createMemoryDataAdapter(seedData);

  async function ensureFile() {
    try {
      await fs.access(dataFile);
    } catch {
      await fs.mkdir(path.dirname(dataFile), { recursive: true });
      await fs.writeFile(dataFile, JSON.stringify(seedData, null, 2));
    }
  }

  async function load() {
    await ensureFile();
    const raw = await fs.readFile(dataFile, "utf8");
    await memory.reset(JSON.parse(raw));
  }

  async function persist() {
    const data = await memory.readSnapshot();
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
  }

  async function mutate(methodName, ...args) {
    await load();
    const result = await memory[methodName](...args);
    await persist();
    return result;
  }

  return {
    ...memory,
    async readSnapshot() {
      await load();
      return await memory.readSnapshot();
    },
    async writeSnapshot(data) {
      await memory.writeSnapshot(data);
      await persist();
    },
    async createSessionForUser(...args) {
      return await mutate("createSessionForUser", ...args);
    },
    async insertUser(...args) {
      return await mutate("insertUser", ...args);
    },
    async updateUserById(...args) {
      return await mutate("updateUserById", ...args);
    },
    async deleteSessionByToken(...args) {
      return await mutate("deleteSessionByToken", ...args);
    },
    async insertRequest(...args) {
      return await mutate("insertRequest", ...args);
    },
    async updateRequestById(...args) {
      return await mutate("updateRequestById", ...args);
    },
    async flagRequestsForSuspendedUser(...args) {
      return await mutate("flagRequestsForSuspendedUser", ...args);
    },
    async acceptRequestAtomic(...args) {
      return await mutate("acceptRequestAtomic", ...args);
    },
    async cancelRequestAtomic(...args) {
      return await mutate("cancelRequestAtomic", ...args);
    },
    async confirmCourierDeliveryAtomic(...args) {
      return await mutate("confirmCourierDeliveryAtomic", ...args);
    },
    async confirmRequesterReceiptAtomic(...args) {
      return await mutate("confirmRequesterReceiptAtomic", ...args);
    },
    async deleteRequestById(...args) {
      return await mutate("deleteRequestById", ...args);
    },
    async deleteRequestsByIds(...args) {
      return await mutate("deleteRequestsByIds", ...args);
    },
    async insertMessages(...args) {
      return await mutate("insertMessages", ...args);
    },
    async appendMessage(...args) {
      return await mutate("appendMessage", ...args);
    },
    async upsertRatingAndRecalculate(...args) {
      return await mutate("upsertRatingAndRecalculate", ...args);
    },
    async markRequestPaidByCheckoutSession(...args) {
      return await mutate("markRequestPaidByCheckoutSession", ...args);
    },
    async deleteMessagesByRequestId(...args) {
      return await mutate("deleteMessagesByRequestId", ...args);
    },
    async deleteMessagesByRequestIds(...args) {
      return await mutate("deleteMessagesByRequestIds", ...args);
    },
  };
}

export function createMongoDataAdapter(db, { ensureIndex }) {
  const collections = {
    users: db.collection("users"),
    sessions: db.collection("sessions"),
    requests: db.collection("requests"),
    ratings: db.collection("ratings"),
    messages: db.collection("messages"),
    idempotencyKeys: db.collection("idempotencyKeys"),
    orderCreationLocks: db.collection("orderCreationLocks"),
  };

  async function ensureNonUniqueSessionUserIndex() {
    const indexes = await collections.sessions.listIndexes().toArray();
    const userIdIndexes = indexes.filter((entry) => {
      const keyEntries = Object.entries(entry.key || {});
      return keyEntries.length === 1 && entry.key?.userId === 1;
    });

    for (const index of userIdIndexes) {
      if (index.unique && index.name) {
        await collections.sessions.dropIndex(index.name);
      }
    }

    await ensureIndex(collections.sessions, { userId: 1 });
  }

  return {
    collections,
    async findDuplicateUsers() {
      const duplicateEmails = await collections.users
        .aggregate([
          {
            $group: {
              _id: { $toLower: { $trim: { input: "$email" } } },
              count: { $sum: 1 },
              userIds: { $push: "$id" },
            },
          },
          { $match: { _id: { $ne: "" }, count: { $gt: 1 } } },
          { $project: { _id: 0, email: "$_id", count: 1, userIds: 1 } },
        ])
        .toArray();
      const duplicateIds = await collections.users
        .aggregate([
          { $group: { _id: "$id", count: { $sum: 1 }, emails: { $push: "$email" } } },
          { $match: { _id: { $nin: [null, ""] }, count: { $gt: 1 } } },
          { $project: { _id: 0, id: "$_id", count: 1, emails: 1 } },
        ])
        .toArray();

      return { emails: duplicateEmails, ids: duplicateIds };
    },
    async ensureIndexes({ skipUserUniqueIndexes = false } = {}) {
      await ensureIndex(collections.requests, { id: 1 }, { unique: true });
      await ensureIndex(collections.sessions, { token: 1 }, { unique: true });
      await ensureNonUniqueSessionUserIndex();
      await ensureIndex(collections.messages, { requestId: 1 }, { unique: true });
      await ensureIndex(collections.ratings, { requestId: 1, authorUserId: 1 }, { unique: true });
      await ensureIndex(collections.idempotencyKeys, { userId: 1, key: 1 }, { unique: true });
      await ensureIndex(collections.idempotencyKeys, { expiresAt: 1 }, { expireAfterSeconds: 0 });
      await ensureIndex(collections.orderCreationLocks, { userId: 1 }, { unique: true });
      await ensureIndex(collections.orderCreationLocks, { expiresAt: 1 }, { expireAfterSeconds: 0 });
      if (!skipUserUniqueIndexes) {
        await ensureIndex(collections.users, { email: 1 }, { unique: true });
        await ensureIndex(collections.users, { id: 1 }, { unique: true });
      }
      return { userUniqueIndexesReady: !skipUserUniqueIndexes };
    },
    canWriteNormalizedSnapshots: false,
    async readSnapshot() {
      const users = await collections.users.find({}).toArray();
      const sessions = await collections.sessions.find({}).toArray();
      const requests = await collections.requests.find({}).toArray();
      const ratings = await collections.ratings.find({}).toArray();
      const messageDocs = await collections.messages.find({}).toArray();
      return { users, sessions, requests, ratings, messages: fromMessageDocs(messageDocs) };
    },
    async writeSnapshot(data) {
      await replaceCollectionDocuments(collections.users, data.users);
      await replaceCollectionDocuments(collections.sessions, data.sessions);
      await replaceCollectionDocuments(collections.requests, data.requests);
      await replaceCollectionDocuments(collections.ratings, data.ratings);
      await collections.messages.deleteMany({});
      const messageDocs = toMessageDocs(data.messages);
      if (messageDocs.length) await collections.messages.insertMany(messageDocs);
    },
    async upsertDemoUser(user) {
      const email = normalizeEmail(user.email);
      const result = await collections.users.updateOne(
        { $or: [{ email }, { id: user.id }] },
        {
          $set: {
            name: user.name,
            phone: user.phone,
            password: user.password,
            authProvider: "password",
            role: user.role,
            courierMode: user.courierMode,
            ualbanyIdUploaded: user.ualbanyIdUploaded,
            ualbanyIdImage: user.ualbanyIdImage,
            foodSafetyVerified: user.foodSafetyVerified,
            notificationsEnabled: user.notificationsEnabled,
            courierOnline: user.courierOnline,
            suspended: user.suspended,
            suspendedReason: user.suspendedReason,
            bio: user.bio,
            rating: user.rating,
            completedJobs: user.completedJobs,
            earnings: user.earnings,
          },
          $setOnInsert: { id: user.id, email },
        },
        { upsert: true },
      );
      return { created: Boolean(result.upsertedCount) };
    },
    async countRequests() {
      return await collections.requests.countDocuments();
    },
    async insertSeedData(seedData) {
      if (seedData.sessions?.length) await collections.sessions.insertMany(seedData.sessions);
      if (seedData.requests?.length) await collections.requests.insertMany(seedData.requests);
      if (seedData.ratings?.length) await collections.ratings.insertMany(seedData.ratings);
      const messageDocs = toMessageDocs(seedData.messages);
      if (messageDocs.length) await collections.messages.insertMany(messageDocs);
    },
    async findUserByEmail(email) {
      return await collections.users.findOne({ email: normalizeEmail(email) });
    },
    async insertUser(user) {
      const email = normalizeEmail(user.email);
      const existing = await collections.users.findOne({ $or: [{ email }, { id: user.id }] });
      if (existing) {
        const error = new Error("Duplicate user");
        error.code = 11000;
        error.keyPattern = existing.email === email ? { email: 1 } : { id: 1 };
        throw error;
      }
      await collections.users.insertOne({ ...user, email });
    },
    async updateUserById(userId, updates) {
      return await collections.users.updateOne({ id: userId }, { $set: updates });
    },
    async createSessionForUser(userId, session) {
      const previousSessionCount = await collections.sessions.countDocuments({ userId });
      await collections.sessions.insertOne(session);
      return { previousSessionCount };
    },
    async findSessionByToken(token) {
      return await collections.sessions.findOne({ token });
    },
    async deleteSessionByToken(token) {
      return await collections.sessions.deleteOne({ token });
    },
    async reserveIdempotencyRecord(record) {
      try {
        await collections.idempotencyKeys.insertOne(record);
        return { reserved: true, record };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 11000) {
          const existing = await collections.idempotencyKeys.findOne({ userId: record.userId, key: record.key });
          return { reserved: false, record: existing };
        }
        throw error;
      }
    },
    async findIdempotencyRecord(userId, key) {
      return await collections.idempotencyKeys.findOne({ userId, key });
    },
    async completeIdempotencyRecord({ userId, key, updates }) {
      await collections.idempotencyKeys.updateOne({ userId, key }, { $set: updates });
    },
    async deleteIdempotencyRecord(userId, key) {
      await collections.idempotencyKeys.deleteOne({ userId, key });
    },
    async acquireOrderCreationLock(userId, expiresAt) {
      await collections.orderCreationLocks.insertOne({ userId, createdAt: new Date(), expiresAt });
      return true;
    },
    async releaseOrderCreationLock(userId) {
      await collections.orderCreationLocks.deleteOne({ userId });
    },
    async findActiveRequestsByUser(userId) {
      return await collections.requests.find({
        userId,
        moderationStatus: { $ne: "removed" },
        status: { $in: ["open", "accepted"] },
      }).toArray();
    },
    async countActiveRequestsByUser(userId) {
      return await collections.requests.countDocuments({
        userId,
        moderationStatus: { $ne: "removed" },
        status: { $in: ["open", "accepted"] },
      });
    },
    async insertRequest(requestRecord) {
      await collections.requests.insertOne(requestRecord);
    },
    async updateRequestById(requestId, updates) {
      return await collections.requests.updateOne({ id: requestId }, { $set: updates });
    },
    async flagRequestsForSuspendedUser(userId, reason) {
      const matchUser = { $or: [{ userId }, { acceptedBy: userId }] };
      const result = await collections.requests.updateMany(matchUser, {
        $set: {
          flagged: true,
          flaggedReason: reason,
        },
      });
      await collections.requests.updateMany(
        { ...matchUser, moderationStatus: "clear" },
        { $set: { moderationStatus: "flagged" } },
      );
      return result;
    },
    async findRequestById(requestId) {
      return await collections.requests.findOne({ id: requestId });
    },
    async acceptRequestAtomic(requestId, courierId) {
      const result = await collections.requests.findOneAndUpdate(
        {
          id: requestId,
          status: "open",
          acceptedBy: null,
          userId: { $ne: courierId },
          moderationStatus: { $ne: "removed" },
        },
        { $set: { status: "accepted", acceptedBy: courierId } },
        { returnDocument: "after" },
      );
      const requestRecord = result?.value || result;
      return { modifiedCount: requestRecord ? 1 : 0, request: requestRecord || null };
    },
    async cancelRequestAtomic(requestId, userId, updates) {
      const result = await collections.requests.findOneAndUpdate(
        {
          id: requestId,
          userId,
          status: { $in: ["open", "accepted"] },
          paymentStatus: { $nin: ["paid", "pending"] },
          moderationStatus: { $ne: "removed" },
        },
        { $set: updates },
        { returnDocument: "after" },
      );
      const requestRecord = result?.value || result;
      return { modifiedCount: requestRecord ? 1 : 0, request: requestRecord || null };
    },
    async confirmCourierDeliveryAtomic(requestId, courierId, updates) {
      const result = await collections.requests.findOneAndUpdate(
        {
          id: requestId,
          acceptedBy: courierId,
          status: "accepted",
          paymentStatus: "paid",
          deliveryConfirmedByCourier: { $ne: true },
          moderationStatus: { $ne: "removed" },
        },
        { $set: updates },
        { returnDocument: "after" },
      );
      const requestRecord = result?.value || result;
      return { modifiedCount: requestRecord ? 1 : 0, request: requestRecord || null };
    },
    async confirmRequesterReceiptAtomic(requestId, requesterId, updates) {
      const result = await collections.requests.findOneAndUpdate(
        {
          id: requestId,
          userId: requesterId,
          status: "accepted",
          paymentStatus: "paid",
          deliveryConfirmedByCourier: true,
          receivedConfirmedByRequester: { $ne: true },
          moderationStatus: { $ne: "removed" },
        },
        { $set: updates },
        { returnDocument: "after" },
      );
      const requestRecord = result?.value || result;
      if (requestRecord?.status === "completed" && requestRecord.acceptedBy) {
        const earnings =
          requestRecord.serviceType === "discount" && typeof requestRecord.runnerEarnings === "number"
            ? requestRecord.runnerEarnings
            : Number.parseFloat(requestRecord.payment || "0");
        await collections.users.updateOne(
          { id: requestRecord.acceptedBy },
          {
            $inc: {
              completedJobs: 1,
              earnings: Number.isFinite(earnings) ? earnings : 0,
            },
          },
        );
      }
      return { modifiedCount: requestRecord ? 1 : 0, request: requestRecord || null };
    },
    async deleteRequestById(requestId) {
      await collections.requests.deleteOne({ id: requestId });
    },
    async deleteRequestsByIds(requestIds) {
      await collections.requests.deleteMany({ id: { $in: requestIds } });
    },
    async insertMessages(requestId, messages) {
      await collections.messages.insertOne({ requestId, messages });
    },
    async appendMessage(requestId, message) {
      await collections.messages.updateOne(
        { requestId },
        { $push: { messages: message } },
        { upsert: true },
      );
    },
    async upsertRatingAndRecalculate(ratingRecord) {
      await collections.ratings.updateOne(
        { requestId: ratingRecord.requestId, authorUserId: ratingRecord.authorUserId },
        { $set: ratingRecord },
        { upsert: true },
      );
      const userRatings = await collections.ratings.find({ targetUserId: ratingRecord.targetUserId }).toArray();
      const averageRating = userRatings.reduce((total, entry) => total + Number(entry.rating || 0), 0) / userRatings.length;
      const rating = Number(averageRating.toFixed(1));
      await collections.users.updateOne({ id: ratingRecord.targetUserId }, { $set: { rating } });
      const targetUser = await collections.users.findOne({ id: ratingRecord.targetUserId });
      return { rating: ratingRecord, targetUser };
    },
    async markRequestPaidByCheckoutSession(checkoutSessionId, updates) {
      const result = await collections.requests.findOneAndUpdate(
        {
          stripeCheckoutSessionId: checkoutSessionId,
          paymentStatus: { $ne: "paid" },
        },
        { $set: updates },
        { returnDocument: "after" },
      );
      const requestRecord = result?.value || result;
      return { modifiedCount: requestRecord ? 1 : 0, request: requestRecord || null };
    },
    async deleteMessagesByRequestId(requestId) {
      await collections.messages.deleteOne({ requestId });
    },
    async deleteMessagesByRequestIds(requestIds) {
      await collections.messages.deleteMany({ requestId: { $in: requestIds } });
    },
  };
}

async function replaceCollectionDocuments(collection, documents = []) {
  await collection.deleteMany({});
  if (!documents.length) return;
  await collection.insertMany(documents.map(({ _id, ...rest }) => rest));
}
