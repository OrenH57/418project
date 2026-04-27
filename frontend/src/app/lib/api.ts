// File purpose:
// Typed frontend API client and shared record types.
// Pages should call backend routes through this file instead of building fetch calls inline.

function isLocalApiBase(value: string) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api\/?$/i.test(value);
}

function getApiBase() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  const isBrowserLocal =
    typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  if (configured && (!isLocalApiBase(configured) || isBrowserLocal)) {
    return configured.replace(/\/$/, "");
  }

  return "/api";
}

const API_BASE = getApiBase();
export const AUTH_EXPIRED_EVENT = "campus-connect-auth-expired";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "requester" | "courier" | "admin";
  courierMode: boolean;
  ualbanyIdUploaded: boolean;
  ualbanyIdImage?: string;
  foodSafetyVerified: boolean;
  notificationsEnabled: boolean;
  courierOnline: boolean;
  suspended?: boolean;
  suspendedReason?: string;
  bio: string;
  rating: number;
  completedJobs: number;
  earnings: number;
};

export type RequestRecord = {
  id: string;
  userId: string;
  requesterName: string;
  requesterPhone?: string;
  serviceType: string;
  pickup: string;
  destination: string;
  deliveryLocationId?: string;
  deliveryLocationLabel?: string;
  time: string;
  payment: string;
  basePayment?: number;
  tipAmount?: number;
  notes: string;
  status: string;
  acceptedBy: string | null;
  timeAgo: string;
  courierName: string | null;
  orderEta?: string;
  foodReady?: boolean;
  foodReadyAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  closedBy?: string;
  orderScreenshot?: string;
  estimatedRetailTotal?: number;
  estimatedDiscountCost?: number;
  runnerEarnings?: number;
  paymentStatus?: "unpaid" | "pending" | "paid" | "failed";
  paidAt?: string;
  flagged?: boolean;
  flaggedReason?: string;
  moderationStatus?: "clear" | "flagged" | "removed";
  removedAt?: string;
  removedBy?: string;
};

export type AdminOverview = {
  flaggedRequests: RequestRecord[];
  moderatedRequests: RequestRecord[];
  users: User[];
  blockedKeywords: string[];
  metrics: {
    activeUsers: number;
    openRequests: number;
    flaggedCases: number;
    suspendedUsers: number;
    grossVolume: string;
  };
};

export type MessageRecord = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  mine: boolean;
};

export type RatingSummary = {
  requestId: string;
  targetUser: { id: string; name: string } | null;
  canRate: boolean;
  existingRating: {
    requestId: string;
    authorUserId: string;
    targetUserId: string;
    rating: number;
    comment: string;
    createdAt: string;
  } | null;
};

export type CampusSnapshot = {
  onlineCouriers: number;
  openRequests: number;
  avgPayout: number;
  busiestZone: string;
  lunchRushLabel: string;
  myRecentRequests: Array<{
    id: string;
    serviceType: string;
    pickup: string;
    destination: string;
    payment: string;
    notes: string;
  }>;
};

export type DeliveryLocationPrice = {
  id: string;
  label: string;
  fee: number;
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Could not reach the CampusConnect server. Check that the backend is running and try again.");
  }

  let payload: unknown = {};
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed.";
    if (response.status === 401 && token) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message: errorMessage, token } }));
    }
    throw new Error(errorMessage);
  }

  return payload as T;
}

export const api = {
  signup(input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: "requester" | "courier";
    ualbanyIdImage?: string;
  }) {
    return request<{ token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }) {
    return request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  logout(token: string) {
    return request<{ ok: true }>("/auth/logout", {
      method: "POST",
    }, token);
  },
  outlookLogin(input: {
    idToken: string;
    role: "requester" | "courier";
    phone?: string;
    ualbanyIdImage?: string;
  }) {
    return request<{ token: string; user: User }>("/auth/outlook", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  session(token: string) {
    return request<{ user: User }>("/session", {}, token);
  },
  bootstrap(token: string) {
    return request<{
      user: User;
      restaurants: string[];
      deliveryLocations: DeliveryLocationPrice[];
      requests: RequestRecord[];
      campusSnapshot: CampusSnapshot;
    }>(
      "/bootstrap",
      {},
      token,
    );
  },
  getRequests(token: string, mode: "all" | "mine" | "courier") {
    return request<{ requests: RequestRecord[] }>(`/requests?mode=${mode}`, {}, token);
  },
  createRequest(
    token: string,
    input: {
      serviceType: string;
      pickup: string;
      destination: string;
      deliveryLocationId?: string;
      deliveryLocationLabel?: string;
      time: string;
      payment: string;
      tipAmount?: number;
      idempotencyKey?: string;
      notes: string;
      orderEta?: string;
      orderScreenshot?: string;
      estimatedRetailTotal?: number;
      startCheckout?: boolean;
    },
  ) {
    return request<{ request: RequestRecord; checkoutUrl?: string; duplicate?: boolean }>("/requests", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  acceptRequest(token: string, requestId: string) {
    return request<{ request: RequestRecord }>(`/requests/${requestId}/accept`, {
      method: "POST",
    }, token);
  },
  getMessages(token: string, requestId: string) {
    return request<{ request: RequestRecord; messages: MessageRecord[] }>(`/messages/${requestId}`, {}, token);
  },
  sendMessage(token: string, requestId: string, text: string) {
    return request<{ ok: true }>(`/messages/${requestId}`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }, token);
  },
  markFoodReady(token: string, requestId: string) {
    return request<{ request: RequestRecord }>(`/requests/${requestId}/ready`, {
      method: "POST",
    }, token);
  },
  completeRequest(token: string, requestId: string) {
    return request<{ request: RequestRecord }>(`/requests/${requestId}/complete`, {
      method: "POST",
    }, token);
  },
  cancelRequest(token: string, requestId: string) {
    return request<{ request: RequestRecord }>(`/requests/${requestId}/cancel`, {
      method: "POST",
    }, token);
  },
  getProfile(token: string) {
    return request<{
      profile: User & { postedRequests: number; acceptedRequests: number };
    }>("/profile", {}, token);
  },
  updateProfile(
    token: string,
    input: {
      courierMode: boolean;
      bio: string;
      ualbanyIdImage?: string;
      notificationsEnabled?: boolean;
      courierOnline?: boolean;
    },
  ) {
    return request<{ user: User }>("/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    }, token);
  },
  requestCourierVerificationCode(token: string) {
    return request<{ ok: true; previewCode: string }>(
      "/profile/request-verification-code",
      {
        method: "POST",
      },
      token,
    );
  },
  verifyCourierCode(token: string, code: string) {
    return request<{ user: User }>(
      "/profile/verify-code",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
      token,
    );
  },
  createCheckoutSession(token: string, requestId: string, tipAmount?: number) {
    return request<{ url: string }>(
      "/payments/create-checkout-session",
      {
        method: "POST",
        body: JSON.stringify({ requestId, ...(tipAmount === undefined ? {} : { tipAmount }) }),
      },
      token,
    );
  },
  confirmCheckout(
    token: string,
    requestId: string,
    paymentState: "success" | "cancelled",
    checkoutSessionId?: string,
  ) {
    return request<{ request: RequestRecord }>(
      "/payments/confirm",
      {
        method: "POST",
        body: JSON.stringify({ requestId, paymentState, checkoutSessionId }),
      },
      token,
    );
  },
  getRatingSummary(token: string, requestId: string) {
    return request<RatingSummary>(`/ratings/${requestId}`, {}, token);
  },
  submitRating(token: string, requestId: string, input: { rating: number; comment: string }) {
    return request<{ ok: true; targetUser: { id: string; name: string; rating: number } }>(
      `/ratings/${requestId}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      token,
    );
  },
  getAdminOverview(token: string) {
    return request<AdminOverview>("/admin/overview", {}, token);
  },
  moderateRequest(token: string, requestId: string, input: { action: "flag" | "remove" | "clear"; reason?: string }) {
    return request<{ request: RequestRecord }>(
      `/admin/requests/${requestId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
      token,
    );
  },
  suspendUser(token: string, userId: string, input: { suspended: boolean; reason?: string }) {
    return request<{ user: User }>(
      `/admin/users/${userId}/suspension`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
      token,
    );
  },
};
