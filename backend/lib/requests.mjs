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
