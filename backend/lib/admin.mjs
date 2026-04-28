// File purpose:
// Moderation and admin-dashboard helpers shared across backend routes.

export const blockedRequestKeywords = [
  "weapon",
  "drugs",
  "alcohol run",
  "fake id",
  "stolen",
];

export function requireAdmin(user, response, sendJson) {
  if (user.role !== "admin") {
    sendJson(response, 403, { error: "Only admin accounts can access that page." });
    return false;
  }
  return true;
}

function matchesBlockedKeyword(requestRecord) {
  const haystack = [
    requestRecord.pickup,
    requestRecord.destination,
    requestRecord.notes,
  ]
    .join(" ")
    .toLowerCase();
  return blockedRequestKeywords.find((keyword) => haystack.includes(keyword));
}

export function applyAutomaticModeration(requestRecord) {
  const blockedKeyword = matchesBlockedKeyword(requestRecord);
  if (!blockedKeyword) {
    return;
  }

  requestRecord.flagged = true;
  requestRecord.flaggedReason = `Matched blocked keyword: ${blockedKeyword}`;
  requestRecord.moderationStatus = "flagged";
}

export function buildAdminOverview(data, sanitizeUser) {
  const visibleRequests = data.requests.filter((entry) => entry.moderationStatus !== "removed");
  const grossVolume = visibleRequests.reduce(
    (total, entry) => total + (Number.isFinite(Number.parseFloat(entry.payment || "0")) ? Number.parseFloat(entry.payment) : 0),
    0,
  );

  return {
    listings: visibleRequests
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    flaggedRequests: data.requests
      .filter((entry) => entry.moderationStatus === "flagged")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    moderatedRequests: data.requests
      .filter((entry) => entry.moderationStatus === "removed")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    users: data.users
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => sanitizeUser(entry)),
    blockedKeywords: blockedRequestKeywords,
    metrics: {
      activeUsers: data.users.filter((entry) => !entry.suspended).length,
      openRequests: visibleRequests.filter((entry) => entry.status === "open").length,
      flaggedCases: data.requests.filter((entry) => entry.moderationStatus === "flagged").length,
      suspendedUsers: data.users.filter((entry) => entry.suspended).length,
      grossVolume: `$${grossVolume.toFixed(0)}`,
    },
  };
}
