// File purpose:
// Request/order business workflows shared by the request routes.

import crypto from "node:crypto";
import { DISCOUNT_RATE, MIN_PAYMENT_OFFER } from "../lib/config.mjs";
import { applyAutomaticModeration } from "../lib/admin.mjs";
import { DELIVERY_LOCATIONS, getDeliveryPricingForLocation } from "../lib/deliveryPricing.mjs";
import {
  createIdempotencyExpiry,
  createRequestFingerprint,
  getSafeIdempotencyKeyRef,
  normalizeIdempotencyKey,
} from "../lib/idempotency.mjs";
import { buildPaymentTotal, formatPaymentAmount, parseOptionalTip } from "../lib/paymentPolicy.mjs";
import {
  canAccessRequest,
  decoratePublicCourierRequest,
  decorateRequest,
  findRecentDuplicateRequest,
  findRecentSimilarSubmission,
  getCampusSnapshot,
  isActiveRequestStatus,
  isVisibleRequest,
} from "../lib/requests.mjs";
import { truncateText, validateDataImage } from "../lib/security.mjs";

const MAX_ACTIVE_REQUESTS_PER_USER = 3;
const ORDER_CREATION_LOCK_TTL_MS = 30 * 1000;

function getRequestCreationGuardError(requestRecord) {
  if (!requestRecord?.id) return "Order id is required.";
  if (!requestRecord.userId) return "Order user is required.";
  if (!requestRecord.serviceType) return "Order service type is required.";
  if (!requestRecord.pickup) return "Pickup is required.";
  if (!requestRecord.time) return "Delivery time is required.";
  if (!requestRecord.payment) return "Delivery fee is required.";

  if (requestRecord.serviceType === "food") {
    if (!requestRecord.destination) return "Delivery destination is required for food orders.";
    if (!requestRecord.deliveryLocationId) return "Delivery location is required for food orders.";
  }

  return "";
}

async function reserveIdempotencyKey({ dataRepository, log, userId, key, fingerprint }) {
  if (!key) {
    log("idempotency.missing_key", { userId });
    return { reserved: false };
  }

  const record = {
    userId,
    key,
    fingerprint,
    status: "pending",
    createdAt: new Date(),
    expiresAt: createIdempotencyExpiry(),
  };

  const result = await dataRepository.reserveIdempotencyRecord(record);
  if (result.reserved) {
    log("idempotency.reserved", {
      userId,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(key),
      fingerprint,
      expiresAt: record.expiresAt.toISOString(),
    });
    return { reserved: true, record };
  }

  log("idempotency.reused", {
    userId,
    idempotencyKeyRef: getSafeIdempotencyKeyRef(key),
    existingStatus: result.record?.status || "missing",
    fingerprintMatches: result.record?.fingerprint ? result.record.fingerprint === fingerprint : null,
  });
  return result;
}

async function waitForCompletedIdempotencyRecord(dataRepository, userId, key) {
  const deadline = Date.now() + 2500;

  while (Date.now() < deadline) {
    const record = await dataRepository.findIdempotencyRecord(userId, key);
    if (record?.status === "completed") {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return await dataRepository.findIdempotencyRecord(userId, key);
}

async function completeIdempotencyKey({ dataRepository, userId, key, statusCode, payload }) {
  if (!key) return;
  await dataRepository.completeIdempotencyRecord({ userId, key, statusCode, payload });
}

async function acquireOrderCreationLock(dataRepository, userId) {
  const deadline = Date.now() + 2500;

  while (Date.now() < deadline) {
    try {
      return await dataRepository.acquireOrderCreationLock(userId, new Date(Date.now() + ORDER_CREATION_LOCK_TTL_MS));
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return false;
}

export function buildBootstrapPayload(auth) {
  return {
    restaurants: auth.data.restaurants,
    deliveryLocations: DELIVERY_LOCATIONS,
    requests: auth.data.requests
      .filter((entry) => entry.userId === auth.user.id)
      .filter(isVisibleRequest)
      .map((entry) => decorateRequest(entry, auth.data)),
    campusSnapshot: getCampusSnapshot(auth.data, auth.user.id),
  };
}

export function listRequestsForUser(auth, mode) {
  let filtered = auth.data.requests;

  if (mode === "mine") {
    filtered = filtered.filter((entry) => entry.userId === auth.user.id);
  } else if (mode === "courier") {
    filtered = filtered.filter((entry) => entry.status === "open" || entry.acceptedBy === auth.user.id);
  } else {
    filtered = filtered.filter((entry) => entry.userId === auth.user.id);
  }

  return filtered
    .filter((entry) => entry.moderationStatus !== "removed")
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((entry) =>
      mode === "courier" && entry.status === "open" && entry.acceptedBy !== auth.user.id
        ? decoratePublicCourierRequest(entry)
        : decorateRequest(entry, auth.data),
    );
}

export async function createOrder({
  auth,
  body,
  request,
  dataRepository,
  createStripeCheckoutSession,
  log,
}) {
  const startCheckout = body.startCheckout === true;
  const serviceType = String(body.serviceType || "food");
  const deliveryPricing = serviceType === "food" ? getDeliveryPricingForLocation(body.deliveryLocationId) : null;
  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
  const idempotencyFingerprint = createRequestFingerprint(body);
  log("order.create.attempt", {
    userId: auth.user.id,
    serviceType,
    pickup: String(body.pickup || "").trim(),
    destination: String(body.destination || "").trim(),
    deliveryLocationId: String(body.deliveryLocationId || "").trim(),
    idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    fingerprint: idempotencyFingerprint,
    startCheckout,
  });

  if (deliveryPricing && !deliveryPricing.ok) {
    log("order.create.rejected", {
      userId: auth.user.id,
      reason: deliveryPricing.error,
      deliveryLocationId: String(body.deliveryLocationId || "").trim(),
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: deliveryPricing.error } };
  }

  const tipResult = parseOptionalTip(body.tipAmount);
  if (!tipResult.ok) {
    log("order.create.rejected", {
      userId: auth.user.id,
      reason: "invalid_tip",
      tipAmount: body.tipAmount,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: tipResult.error } };
  }

  const basePayment = deliveryPricing?.fee ?? MIN_PAYMENT_OFFER;
  const paymentTotal = buildPaymentTotal(basePayment, tipResult.amount);
  const screenshotResult = validateDataImage(body.orderScreenshot, {
    required: false,
    maxBytes: 2 * 1024 * 1024,
  });
  if (!screenshotResult.ok) {
    return { statusCode: 400, payload: { error: screenshotResult.error } };
  }

  const requestRecord = {
    id: `request-${crypto.randomUUID()}`,
    userId: auth.user.id,
    requesterName: auth.user.name,
    serviceType,
    pickup: truncateText(body.pickup, 120),
    destination: truncateText(body.destination, 180),
    time: truncateText(body.time, 80),
    payment: formatPaymentAmount(paymentTotal),
    basePayment,
    tipAmount: tipResult.amount,
    deliveryLocationId: deliveryPricing?.id ?? "",
    deliveryLocationLabel: deliveryPricing?.label ?? "",
    notes: truncateText(body.notes, 1000),
    orderEta: truncateText(body.orderEta, 120),
    foodReady: false,
    foodReadyAt: "",
    deliveryConfirmedByCourier: false,
    deliveredAt: "",
    receivedConfirmedByRequester: false,
    receivedAt: "",
    completedAt: "",
    cancelledAt: "",
    expiredAt: "",
    closedBy: "",
    orderScreenshot: screenshotResult.value,
    estimatedRetailTotal: Number.isFinite(Number(body.estimatedRetailTotal)) ? Number(body.estimatedRetailTotal) : null,
    estimatedDiscountCost: null,
    runnerEarnings: null,
    paymentStatus: "unpaid",
    paidAt: "",
    stripeCheckoutSessionId: "",
    status: "open",
    acceptedBy: null,
    flagged: false,
    flaggedReason: "",
    moderationStatus: "clear",
    removedAt: "",
    removedBy: "",
    createdAt: new Date().toISOString(),
  };

  const basicValidationError = validateNewRequestRecord({ requestRecord, idempotencyKey, log, userId: auth.user.id });
  if (basicValidationError) return basicValidationError;

  const discountValidationError = validateDiscountRequest({ requestRecord, idempotencyKey, log, userId: auth.user.id });
  if (discountValidationError) return discountValidationError;

  const requestCreationError = getRequestCreationGuardError(requestRecord);
  if (requestCreationError) {
    log("order.create.rejected", {
      userId: auth.user.id,
      reason: requestCreationError,
      requestId: requestRecord.id,
      serviceType: requestRecord.serviceType,
      deliveryLocationId: requestRecord.deliveryLocationId,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: requestCreationError } };
  }

  const idempotencyResult = await handleExistingIdempotencyRecord({
    dataRepository,
    log,
    auth,
    idempotencyKey,
    idempotencyFingerprint,
  });
  if (idempotencyResult) return idempotencyResult;

  const lockAcquired = await acquireOrderCreationLock(dataRepository, auth.user.id);
  if (!lockAcquired) {
    await dataRepository.deleteIdempotencyRecord(auth.user.id, idempotencyKey);
    log("duplicate_prevention.order_lock_timeout", {
      userId: auth.user.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 409, payload: { error: "Another order is already being created. Please try again." } };
  }

  try {
    return await createOrderWhileLocked({
      auth,
      request,
      requestRecord,
      startCheckout,
      idempotencyKey,
      idempotencyFingerprint,
      dataRepository,
      createStripeCheckoutSession,
      log,
    });
  } catch (error) {
    await dataRepository.deleteIdempotencyRecord(auth.user.id, idempotencyKey);
    await dataRepository.deleteRequestById(requestRecord.id);
    await dataRepository.deleteMessagesByRequestId(requestRecord.id);
    log("order.create.failed", {
      userId: auth.user.id,
      requestId: requestRecord.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await dataRepository.releaseOrderCreationLock(auth.user.id);
  }
}

function validateNewRequestRecord({ requestRecord, idempotencyKey, log, userId }) {
  if (!requestRecord.pickup || !requestRecord.time || !requestRecord.payment) {
    log("order.create.rejected", {
      userId,
      reason: "missing_required_fields",
      requestId: requestRecord.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: "Pickup, time, and delivery fee are required." } };
  }

  if (requestRecord.serviceType === "food" && !requestRecord.destination) {
    log("order.create.rejected", {
      userId,
      reason: "missing_destination",
      requestId: requestRecord.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: "Delivery destination is required for food orders." } };
  }

  const paymentAmount = Number.parseFloat(requestRecord.payment);
  if (!Number.isFinite(paymentAmount) || paymentAmount < MIN_PAYMENT_OFFER) {
    log("order.create.rejected", {
      userId,
      reason: "invalid_payment",
      requestId: requestRecord.id,
      payment: requestRecord.payment,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: `Payment offers must be at least $${MIN_PAYMENT_OFFER}.` } };
  }

  return null;
}

function validateDiscountRequest({ requestRecord, idempotencyKey, log, userId }) {
  if (requestRecord.serviceType !== "discount") return null;

  if (!Number.isFinite(requestRecord.estimatedRetailTotal)) {
    log("order.create.rejected", {
      userId,
      reason: "missing_estimated_retail_total",
      requestId: requestRecord.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: "Estimated retail total is required for discount dollar runs." } };
  }

  const paymentAmount = Number.parseFloat(requestRecord.payment);
  requestRecord.estimatedDiscountCost = Number((requestRecord.estimatedRetailTotal * (1 - DISCOUNT_RATE)).toFixed(2));
  requestRecord.runnerEarnings = Number((paymentAmount - requestRecord.estimatedDiscountCost).toFixed(2));

  if (requestRecord.runnerEarnings <= 0) {
    log("order.create.rejected", {
      userId,
      reason: "invalid_runner_earnings",
      requestId: requestRecord.id,
      payment: requestRecord.payment,
      estimatedDiscountCost: requestRecord.estimatedDiscountCost,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    return { statusCode: 400, payload: { error: "Platform payment must leave room for the runner to earn money." } };
  }

  return null;
}

async function handleExistingIdempotencyRecord({ dataRepository, log, auth, idempotencyKey, idempotencyFingerprint }) {
  const idempotencyReservation = await reserveIdempotencyKey({
    dataRepository,
    log,
    userId: auth.user.id,
    key: idempotencyKey,
    fingerprint: idempotencyFingerprint,
  });

  if (!idempotencyKey || idempotencyReservation.reserved) return null;

  const existingRecord =
    idempotencyReservation.record?.status === "completed"
      ? idempotencyReservation.record
      : await waitForCompletedIdempotencyRecord(dataRepository, auth.user.id, idempotencyKey);

  if (existingRecord?.fingerprint && existingRecord.fingerprint !== idempotencyFingerprint) {
    log("duplicate_prevention.idempotency_conflict", {
      userId: auth.user.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
      incomingFingerprint: idempotencyFingerprint,
      existingFingerprint: existingRecord.fingerprint,
    });
    return { statusCode: 409, payload: { error: "This request key was already used for a different order." } };
  }

  if (existingRecord?.status === "completed" && existingRecord.responsePayload) {
    log("duplicate_prevention.idempotency_replay", {
      userId: auth.user.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
      responseStatus: existingRecord.responseStatus || 200,
      requestId: existingRecord.responsePayload?.request?.id || "",
    });
    return { statusCode: existingRecord.responseStatus || 200, payload: existingRecord.responsePayload };
  }

  log("duplicate_prevention.idempotency_pending", {
    userId: auth.user.id,
    idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    existingStatus: existingRecord?.status || "missing",
  });
  return { statusCode: 409, payload: { error: "This order is already being processed. Please wait a moment." } };
}

async function createOrderWhileLocked({
  auth,
  request,
  requestRecord,
  startCheckout,
  idempotencyKey,
  idempotencyFingerprint,
  dataRepository,
  createStripeCheckoutSession,
  log,
}) {
  applyAutomaticModeration(requestRecord);

  const duplicateCandidates = await dataRepository.findActiveRequestsByUser(auth.user.id);
  const duplicateRequest =
    findRecentDuplicateRequest(duplicateCandidates, requestRecord) ||
    findRecentSimilarSubmission(duplicateCandidates, requestRecord);
  if (duplicateRequest) {
    const payload = {
      duplicate: true,
      request: decorateRequest(duplicateRequest, auth.data),
    };
    log("duplicate_prevention.recent_duplicate", {
      userId: auth.user.id,
      incomingRequestId: requestRecord.id,
      existingRequestId: duplicateRequest.id,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
      fingerprint: idempotencyFingerprint,
    });
    await completeIdempotencyKey({
      dataRepository,
      userId: auth.user.id,
      key: idempotencyKey,
      statusCode: 200,
      payload,
    });
    return { statusCode: 200, payload };
  }

  const activeRequestCount = await dataRepository.countActiveRequestsByUser(auth.user.id);
  if (activeRequestCount >= MAX_ACTIVE_REQUESTS_PER_USER) {
    const payload = {
      error: `You can only have ${MAX_ACTIVE_REQUESTS_PER_USER} active orders at a time.`,
    };
    log("duplicate_prevention.active_limit", {
      userId: auth.user.id,
      activeRequestCount,
      maxActiveRequests: MAX_ACTIVE_REQUESTS_PER_USER,
      idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    });
    await completeIdempotencyKey({
      dataRepository,
      userId: auth.user.id,
      key: idempotencyKey,
      statusCode: 400,
      payload,
    });
    return { statusCode: 400, payload };
  }

  await dataRepository.insertRequest(requestRecord);
  const messages = [
    {
      id: `message-${crypto.randomUUID()}`,
      senderId: auth.user.id,
      senderName: auth.user.name,
      text:
        requestRecord.serviceType === "food"
          ? `Food delivery request posted for ${requestRecord.pickup}.`
          : "Request posted successfully.",
      createdAt: new Date().toISOString(),
    },
  ];

  if (startCheckout) {
    return await startCheckoutForNewOrder({
      auth,
      request,
      requestRecord,
      messages,
      idempotencyKey,
      dataRepository,
      createStripeCheckoutSession,
      log,
    });
  }

  await dataRepository.insertMessages(requestRecord.id, messages);
  const payload = { request: decorateRequest(requestRecord, auth.data) };
  await completeIdempotencyKey({
    dataRepository,
    userId: auth.user.id,
    key: idempotencyKey,
    statusCode: 201,
    payload,
  });
  logOrderCreated({ log, auth, requestRecord, idempotencyKey, startCheckout });
  return { statusCode: 201, payload };
}

async function startCheckoutForNewOrder({
  auth,
  request,
  requestRecord,
  messages,
  idempotencyKey,
  dataRepository,
  createStripeCheckoutSession,
  log,
}) {
  const amountNumber = Math.round(Number.parseFloat(requestRecord.payment) * 100);

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    await dataRepository.deleteIdempotencyRecord(auth.user.id, idempotencyKey);
    await dataRepository.deleteRequestById(requestRecord.id);
    return { statusCode: 400, payload: { error: "Request payment amount is invalid." } };
  }

  const session = await createStripeCheckoutSession({
    amount: amountNumber,
    requestId: requestRecord.id,
    requesterEmail: auth.user.email,
    description: `${requestRecord.pickup} to ${requestRecord.destination || "campus drop-off"}`,
    request,
  });

  requestRecord.paymentStatus = "pending";
  requestRecord.stripeCheckoutSessionId = String(session.id || "");
  messages.push({
    id: `message-${crypto.randomUUID()}`,
    senderId: auth.user.id,
    senderName: auth.user.name,
    text: "Stripe Checkout started for this request.",
    createdAt: new Date().toISOString(),
  });
  await dataRepository.updateRequestById(requestRecord.id, {
    paymentStatus: requestRecord.paymentStatus,
    stripeCheckoutSessionId: requestRecord.stripeCheckoutSessionId,
  });
  await dataRepository.insertMessages(requestRecord.id, messages);
  const payload = { request: decorateRequest(requestRecord, auth.data), checkoutUrl: session.url };
  await completeIdempotencyKey({
    dataRepository,
    userId: auth.user.id,
    key: idempotencyKey,
    statusCode: 201,
    payload,
  });
  logOrderCreated({ log, auth, requestRecord, idempotencyKey, startCheckout: true });
  return { statusCode: 201, payload };
}

function logOrderCreated({ log, auth, requestRecord, idempotencyKey, startCheckout }) {
  log("order.create.success", {
    userId: auth.user.id,
    requestId: requestRecord.id,
    serviceType: requestRecord.serviceType,
    deliveryLocationId: requestRecord.deliveryLocationId,
    payment: requestRecord.payment,
    paymentStatus: requestRecord.paymentStatus,
    idempotencyKeyRef: getSafeIdempotencyKeyRef(idempotencyKey),
    startCheckout,
  });
}

export async function acceptOrder({ auth, requestId, dataRepository, readData }) {
  const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
  const validation = validateAcceptOrder(auth, requestRecord);
  if (validation) return validation;

  const acceptResult = await dataRepository.acceptRequestAtomic(requestId, auth.user.id);
  if (!acceptResult.modifiedCount || !acceptResult.request) {
    return { statusCode: 409, payload: { error: "This request was already accepted or is no longer open." } };
  }

  const message = {
    id: `message-${crypto.randomUUID()}`,
    senderId: auth.user.id,
    senderName: auth.user.name,
    text: `${auth.user.name} accepted this request and is heading to pickup.`,
    createdAt: new Date().toISOString(),
  };
  await dataRepository.appendMessage(requestId, message);
  const freshData = await readData();
  return { statusCode: 200, payload: { request: decorateRequest(acceptResult.request, freshData) } };
}

function validateAcceptOrder(auth, requestRecord) {
  if (!requestRecord) return { statusCode: 404, payload: { error: "Request not found." } };
  if (requestRecord.moderationStatus === "removed") {
    return { statusCode: 410, payload: { error: "This request was removed by an admin." } };
  }
  if (requestRecord.serviceType === "food" && !auth.user.foodSafetyVerified) {
    return { statusCode: 403, payload: { error: "Verify your campus email before accepting food deliveries." } };
  }
  if (requestRecord.userId === auth.user.id) {
    return { statusCode: 400, payload: { error: "You cannot accept your own request." } };
  }
  if (requestRecord.status === "accepted" && requestRecord.acceptedBy && requestRecord.acceptedBy !== auth.user.id) {
    return { statusCode: 409, payload: { error: "This request was already accepted by another courier." } };
  }
  if (requestRecord.status !== "open" && requestRecord.acceptedBy !== auth.user.id) {
    return { statusCode: 400, payload: { error: "This request is no longer open." } };
  }
  return null;
}

export async function markFoodReady({ auth, requestId, dataRepository }) {
  const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
  const validation = validateMarkFoodReady(auth, requestRecord);
  if (validation) return validation;

  requestRecord.foodReady = true;
  requestRecord.foodReadyAt = new Date().toISOString();
  await dataRepository.updateRequestById(requestId, {
    foodReady: requestRecord.foodReady,
    foodReadyAt: requestRecord.foodReadyAt,
  });
  await dataRepository.appendMessage(requestId, {
    id: `message-${crypto.randomUUID()}`,
    senderId: auth.user.id,
    senderName: auth.user.name,
    text: "I got the GET email. The food is ready for pickup now.",
    createdAt: new Date().toISOString(),
  });
  return { statusCode: 200, payload: { request: decorateRequest(requestRecord, auth.data) } };
}

function validateMarkFoodReady(auth, requestRecord) {
  if (!requestRecord) return { statusCode: 404, payload: { error: "Request not found." } };
  if (requestRecord.moderationStatus === "removed") {
    return { statusCode: 410, payload: { error: "This request was removed by an admin." } };
  }
  if (requestRecord.userId !== auth.user.id) {
    return { statusCode: 403, payload: { error: "Only the requester can mark this order as ready." } };
  }
  if (requestRecord.serviceType !== "food") {
    return { statusCode: 400, payload: { error: "Only food requests can be marked ready." } };
  }
  return null;
}

export async function completeOrder({ auth, requestId, dataRepository, readData }) {
  const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
  const validation = validateCompleteOrder(auth, requestRecord);
  if (validation) return validation;

  const isRequester = requestRecord.userId === auth.user.id;
  const isAssignedCourier = requestRecord.acceptedBy === auth.user.id;
  const now = new Date().toISOString();
  const appendSystemMessage = async (text) => {
    await dataRepository.appendMessage(requestId, {
      id: `message-${crypto.randomUUID()}`,
      senderId: auth.user.id,
      senderName: auth.user.name,
      text,
      createdAt: now,
    });
  };

  let updatedRequest = null;
  if (isAssignedCourier) {
    if (requestRecord.deliveryConfirmedByCourier) {
      return { statusCode: 400, payload: { error: "You already marked this order delivered." } };
    }
    const result = await dataRepository.confirmCourierDeliveryAtomic(requestId, auth.user.id, {
      deliveryConfirmedByCourier: true,
      deliveredAt: now,
    });
    if (!result.modifiedCount || !result.request) {
      return { statusCode: 409, payload: { error: "This order could not be marked delivered. Refresh and try again." } };
    }
    updatedRequest = result.request;
    await appendSystemMessage("Courier marked this order delivered. Waiting for the requester to confirm receipt.");
  } else if (isRequester) {
    if (!requestRecord.deliveryConfirmedByCourier) {
      return { statusCode: 400, payload: { error: "Wait for the courier to mark this order delivered first." } };
    }
    if (requestRecord.receivedConfirmedByRequester) {
      return { statusCode: 400, payload: { error: "You already confirmed receipt for this order." } };
    }
    const result = await dataRepository.confirmRequesterReceiptAtomic(requestId, auth.user.id, {
      receivedConfirmedByRequester: true,
      receivedAt: now,
      status: "completed",
      completedAt: now,
      closedBy: auth.user.id,
    });
    if (!result.modifiedCount || !result.request) {
      return { statusCode: 409, payload: { error: "This order could not be completed. Refresh and try again." } };
    }
    updatedRequest = result.request;
    await appendSystemMessage("Requester confirmed they received the order.");
    await appendSystemMessage("Order completed. Thanks for using CampusConnect.");
  }

  const freshData = await readData();
  return { statusCode: 200, payload: { request: decorateRequest(updatedRequest || requestRecord, freshData) } };
}

function validateCompleteOrder(auth, requestRecord) {
  if (!requestRecord) return { statusCode: 404, payload: { error: "Request not found." } };
  if (requestRecord.moderationStatus === "removed") {
    return { statusCode: 410, payload: { error: "This request was removed by an admin." } };
  }
  if (!canAccessRequest(auth.user.id, requestRecord)) {
    return { statusCode: 403, payload: { error: "Only the requester or assigned courier can complete this order." } };
  }
  if (requestRecord.status !== "accepted" || !requestRecord.acceptedBy) {
    return { statusCode: 400, payload: { error: "Only accepted orders can be completed." } };
  }
  if (requestRecord.paymentStatus !== "paid") {
    return { statusCode: 400, payload: { error: "Payment must be completed before this order can be closed." } };
  }
  return null;
}

export async function cancelOrder({ auth, requestId, dataRepository, readData }) {
  const requestRecord = auth.data.requests.find((entry) => entry.id === requestId);
  const validation = validateCancelOrder(auth, requestRecord);
  if (validation) return validation;

  const now = new Date().toISOString();
  const cancelResult = await dataRepository.cancelRequestAtomic(requestId, auth.user.id, {
    status: "cancelled",
    cancelledAt: now,
    closedBy: auth.user.id,
  });
  if (!cancelResult.modifiedCount || !cancelResult.request) {
    return { statusCode: 409, payload: { error: "This order could not be cancelled. Refresh and try again." } };
  }

  await dataRepository.appendMessage(requestId, {
    id: `message-${crypto.randomUUID()}`,
    senderId: auth.user.id,
    senderName: auth.user.name,
    text: "The requester cancelled this order.",
    createdAt: now,
  });
  const freshData = await readData();
  return { statusCode: 200, payload: { request: decorateRequest(cancelResult.request, freshData) } };
}

function validateCancelOrder(auth, requestRecord) {
  if (!requestRecord) return { statusCode: 404, payload: { error: "Request not found." } };
  if (requestRecord.moderationStatus === "removed") {
    return { statusCode: 410, payload: { error: "This request was removed by an admin." } };
  }
  if (requestRecord.userId !== auth.user.id) {
    return { statusCode: 403, payload: { error: "Only the requester can cancel this order." } };
  }
  if (!isActiveRequestStatus(requestRecord.status)) {
    return { statusCode: 400, payload: { error: "This order is already closed." } };
  }
  if (requestRecord.paymentStatus === "paid") {
    return {
      statusCode: 409,
      payload: {
        error: "This order has already been paid. Contact support or an admin before cancelling so the payment can be reviewed.",
      },
    };
  }
  if (requestRecord.paymentStatus === "pending") {
    return {
      statusCode: 409,
      payload: {
        error: "Stripe checkout is still pending. Finish or cancel checkout in Stripe before cancelling this order.",
      },
    };
  }
  return null;
}
