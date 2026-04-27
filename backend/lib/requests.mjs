// File purpose:
// Request and message formatting helpers shared across backend routes.

export const ACTIVE_REQUEST_STATUSES = ["open", "accepted"];
export const ORDER_TIMEOUT_MS = 60 * 60 * 1000;

export function isActiveRequestStatus(status) {
  return ACTIVE_REQUEST_STATUSES.includes(status);
}

export function isClosedRequestStatus(status) {
  return ["completed", "cancelled", "expired"].includes(status);
}

export function getTimedOutRequestIds(data, now = new Date()) {
  const nowMs = now.getTime();
  const timedOutRequestIds = [];

  for (const request of data.requests || []) {
    if (request.status !== "open") continue;

    const createdAtMs = new Date(request.createdAt).getTime();
    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs < ORDER_TIMEOUT_MS) continue;

    timedOutRequestIds.push(request.id);
  }

  return timedOutRequestIds;
}

export function expireTimedOutRequests(data, now = new Date()) {
  const timedOutRequestIds = new Set(getTimedOutRequestIds(data, now));
  if (!timedOutRequestIds.size) {
    return false;
  }

  data.requests = (data.requests || []).filter((request) => !timedOutRequestIds.has(request.id));
  data.messages = data.messages || {};

  for (const requestId of timedOutRequestIds) {
    delete data.messages[requestId];
  }

  return true;
}

export function formatRelativeTime(iso) {
  const diffMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const hours = Math.round(diffMinutes / 60);
  return `${hours} hr ago`;
}

export function decorateRequest(record, data) {
  const courier = record.acceptedBy
    ? data.users.find((entry) => entry.id === record.acceptedBy)
    : null;
  const requester = data.users.find((entry) => entry.id === record.userId);

  return {
    ...record,
    requesterPhone: requester?.phone || "",
    timeAgo: formatRelativeTime(record.createdAt),
    courierName: courier?.name ?? null,
  };
}

export function decoratePublicCourierRequest(record) {
  return {
    id: record.id,
    userId: "",
    requesterName: "Customer",
    requesterPhone: "",
    serviceType: record.serviceType,
    pickup: record.pickup,
    destination: record.deliveryLocationLabel || "Campus drop-off",
    deliveryLocationId: record.deliveryLocationId || "",
    deliveryLocationLabel: record.deliveryLocationLabel || "",
    time: record.time,
    payment: record.payment,
    basePayment: record.basePayment,
    tipAmount: record.tipAmount,
    notes: "",
    status: record.status,
    acceptedBy: null,
    timeAgo: formatRelativeTime(record.createdAt),
    courierName: null,
    orderEta: "",
    foodReady: false,
    foodReadyAt: "",
    completedAt: "",
    cancelledAt: "",
    expiredAt: "",
    closedBy: "",
    orderScreenshot: "",
    estimatedRetailTotal: null,
    estimatedDiscountCost: null,
    runnerEarnings: null,
    paymentStatus: record.paymentStatus || "unpaid",
    paidAt: "",
    flagged: Boolean(record.flagged),
    flaggedReason: "",
    moderationStatus: record.moderationStatus || "clear",
    removedAt: "",
    removedBy: "",
  };
}

export function canAccessRequest(userId, requestRecord) {
  return requestRecord.userId === userId || requestRecord.acceptedBy === userId;
}

export function normalizeRequestField(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function findRecentDuplicateRequest(requests, candidate) {
  const duplicateWindowMs = 10 * 60 * 1000;
  const candidateCreatedAt = new Date(candidate.createdAt).getTime();
  const effectiveCandidateCreatedAt = Number.isFinite(candidateCreatedAt) ? candidateCreatedAt : Date.now();

  return requests.find((entry) => {
    if (entry.userId !== candidate.userId) return false;
    if (!isActiveRequestStatus(entry.status)) return false;

    const entryCreatedAt = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(entryCreatedAt) || effectiveCandidateCreatedAt - entryCreatedAt > duplicateWindowMs) {
      return false;
    }

    const samePayment =
      normalizeRequestField(candidate.serviceType) === "food"
        ? true
        : normalizeRequestField(entry.payment) === normalizeRequestField(candidate.payment);

    return (
      normalizeRequestField(entry.serviceType) === normalizeRequestField(candidate.serviceType) &&
      normalizeRequestField(entry.pickup) === normalizeRequestField(candidate.pickup) &&
      normalizeRequestField(entry.destination) === normalizeRequestField(candidate.destination) &&
      normalizeRequestField(entry.deliveryLocationId) === normalizeRequestField(candidate.deliveryLocationId) &&
      normalizeRequestField(entry.time) === normalizeRequestField(candidate.time) &&
      samePayment &&
      normalizeRequestField(entry.notes) === normalizeRequestField(candidate.notes) &&
      normalizeRequestField(entry.orderEta) === normalizeRequestField(candidate.orderEta) &&
      normalizeRequestField(entry.orderScreenshot) === normalizeRequestField(candidate.orderScreenshot)
    );
  });
}

export function findRecentSimilarSubmission(requests, candidate) {
  const duplicateWindowMs = 30 * 1000;
  const candidateCreatedAt = new Date(candidate.createdAt).getTime();
  const effectiveCandidateCreatedAt = Number.isFinite(candidateCreatedAt) ? candidateCreatedAt : Date.now();

  return requests.find((entry) => {
    if (entry.userId !== candidate.userId) return false;
    if (!isActiveRequestStatus(entry.status)) return false;

    const entryCreatedAt = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(entryCreatedAt)) return false;
    const ageMs = effectiveCandidateCreatedAt - entryCreatedAt;
    if (ageMs < 0 || ageMs > duplicateWindowMs) return false;

    const samePayment =
      normalizeRequestField(candidate.serviceType) === "food"
        ? true
        : normalizeRequestField(entry.payment) === normalizeRequestField(candidate.payment);

    return (
      normalizeRequestField(entry.serviceType) === normalizeRequestField(candidate.serviceType) &&
      normalizeRequestField(entry.pickup) === normalizeRequestField(candidate.pickup) &&
      normalizeRequestField(entry.destination) === normalizeRequestField(candidate.destination) &&
      normalizeRequestField(entry.deliveryLocationId) === normalizeRequestField(candidate.deliveryLocationId) &&
      normalizeRequestField(entry.time) === normalizeRequestField(candidate.time) &&
      samePayment
    );
  });
}

export function getZoneFromDestination(destination = "") {
  const normalized = destination.toLowerCase();

  if (normalized.includes("state")) return "State Quad";
  if (normalized.includes("dutch")) return "Dutch Quad";
  if (normalized.includes("colonial")) return "Colonial Quad";
  if (normalized.includes("indigenous")) return "Indigenous Quad";
  if (normalized.includes("empire")) return "Empire Commons";
  if (normalized.includes("freedom")) return "Freedom Apartments";
  if (normalized.includes("liberty")) return "Liberty Terrace";
  if (normalized.includes("library")) return "Library";
  if (normalized.includes("massry")) return "Massry Center";
  return "Campus Center";
}

export function getCampusSnapshot(data, currentUserId) {
  const openRequests = data.requests.filter((entry) => entry.status === "open");
  const onlineCouriers = data.users.filter((entry) => entry.courierOnline).length;
  const avgPayout =
    openRequests.length > 0
      ? Number(
          (
            openRequests.reduce((total, entry) => total + Number.parseFloat(entry.payment || "0"), 0) /
            openRequests.length
          ).toFixed(0),
        )
      : 0;

  const zoneCounts = new Map();
  for (const requestRecord of openRequests) {
    const zone = getZoneFromDestination(requestRecord.destination || requestRecord.pickup || "");
    zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1);
  }

  const busiestZone =
    [...zoneCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "Campus Center";

  const myRecentRequests = data.requests
    .filter((entry) => entry.userId === currentUserId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3)
    .map((entry) => ({
      id: entry.id,
      serviceType: entry.serviceType,
      pickup: entry.pickup,
      destination: entry.destination,
      payment: entry.payment,
      notes: entry.notes,
    }));

  return {
    onlineCouriers,
    openRequests: openRequests.length,
    avgPayout,
    busiestZone,
    lunchRushLabel: openRequests.length >= 4 ? "Busy right now" : openRequests.length >= 2 ? "Picking up" : "Quiet right now",
    myRecentRequests,
  };
}
