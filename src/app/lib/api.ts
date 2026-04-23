// File purpose:
// Typed frontend API client and shared record types.
// Pages should call backend routes through this file instead of building fetch calls inline.

const API_BASE = "/api";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "requester" | "courier";
  courierMode: boolean;
  ualbanyIdUploaded: boolean;
  ualbanyIdImage?: string;
  foodSafetyVerified: boolean;
  notificationsEnabled: boolean;
  courierOnline: boolean;
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
  time: string;
  payment: string;
  notes: string;
  status: string;
  acceptedBy: string | null;
  timeAgo: string;
  courierName: string | null;
  orderEta?: string;
  foodReady?: boolean;
  foodReadyAt?: string;
  orderScreenshot?: string;
  estimatedRetailTotal?: number;
  estimatedDiscountCost?: number;
  runnerEarnings?: number;
  paymentStatus?: "unpaid" | "pending" | "paid" | "failed";
  paidAt?: string;
};

export type MessageRecord = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  mine: boolean;
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
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
    return request<{ user: User; restaurants: string[]; requests: RequestRecord[] }>("/bootstrap", {}, token);
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
      time: string;
      payment: string;
      notes: string;
      orderEta?: string;
      orderScreenshot?: string;
      estimatedRetailTotal?: number;
      startCheckout?: boolean;
    },
  ) {
    return request<{ request: RequestRecord; checkoutUrl?: string }>("/requests", {
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
  createCheckoutSession(token: string, requestId: string) {
    return request<{ url: string }>(
      "/payments/create-checkout-session",
      {
        method: "POST",
        body: JSON.stringify({ requestId }),
      },
      token,
    );
  },
  confirmCheckout(token: string, requestId: string, paymentState: "success" | "cancelled") {
    return request<{ request: RequestRecord }>(
      "/payments/confirm",
      {
        method: "POST",
        body: JSON.stringify({ requestId, paymentState }),
      },
      token,
    );
  },
};
