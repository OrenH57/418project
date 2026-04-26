// File purpose:
// Request and message formatting helpers shared across backend routes.

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

export function canAccessRequest(userId, requestRecord) {
  return requestRecord.userId === userId || requestRecord.acceptedBy === userId;
}

export function normalizeRequestField(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function findRecentDuplicateRequest(requests, candidate) {
  const duplicateWindowMs = 10 * 60 * 1000;
  const candidateCreatedAt = Date.now();

  return requests.find((entry) => {
    if (entry.userId !== candidate.userId) return false;
    if (entry.status !== "open" && entry.status !== "accepted") return false;

    const entryCreatedAt = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(entryCreatedAt) || candidateCreatedAt - entryCreatedAt > duplicateWindowMs) {
      return false;
    }

    return (
      normalizeRequestField(entry.serviceType) === normalizeRequestField(candidate.serviceType) &&
      normalizeRequestField(entry.pickup) === normalizeRequestField(candidate.pickup) &&
      normalizeRequestField(entry.destination) === normalizeRequestField(candidate.destination) &&
      normalizeRequestField(entry.time) === normalizeRequestField(candidate.time) &&
      normalizeRequestField(entry.payment) === normalizeRequestField(candidate.payment) &&
      normalizeRequestField(entry.notes) === normalizeRequestField(candidate.notes) &&
      normalizeRequestField(entry.orderEta) === normalizeRequestField(candidate.orderEta) &&
      normalizeRequestField(entry.orderScreenshot) === normalizeRequestField(candidate.orderScreenshot)
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
