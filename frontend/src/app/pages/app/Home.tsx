// File purpose:
// Main requester landing page and lightweight dashboard.
// Shows live campus activity, quick repeat actions, and the current request list.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Car,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  Repeat2,
  Sparkles,
  Store,
  TimerReset,
  UtensilsCrossed,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { api, type CampusSnapshot, type RequestRecord } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { cn } from "../../lib/cn";
import { getStoredView } from "../../lib/viewMode";
import { openGetMobile } from "../../lib/getMobile";
import { canSendBrowserNotifications, sendBrowserNotification } from "../../lib/notifications";

type QuickAction = {
  label: string;
  description: string;
  detail: string;
  path: string;
  icon: LucideIcon;
  accentClassName: string;
};

const quickActions: QuickAction[] = [
  {
    label: "Order Food",
    description: "Order in GET first, then get it delivered to your dorm, library, or study spot.",
    detail: "Most popular",
    path: "/request?type=food&pickup=Starbucks",
    icon: UtensilsCrossed,
    accentClassName: "bg-[var(--brand-maroon)] text-white",
  },
  {
    label: "Need a Ride?",
    description: "Rides are still available when you need a quick trip across campus.",
    detail: "Secondary",
    path: "/request?type=ride",
    icon: Car,
    accentClassName: "bg-[var(--gold-soft)] text-[var(--brand-maroon)]",
  },
];

const howItWorks = [
  {
    title: "Order food in GET",
    body: "Place your food order first so the courier knows it is ready for pickup.",
    icon: Store,
  },
  {
    title: "Send the delivery request",
    body: "Choose your drop-off area, add the screenshot, and see the delivery fee.",
    icon: Sparkles,
  },
  {
    title: "Track everything here",
    body: "Open messages and updates from the same page after you post it.",
    icon: TimerReset,
  },
];

const heroCopy = {
  badge: "UAlbany Food Delivery",
  primaryLabel: "Request Food Delivery",
  primaryPath: "/request?type=food&pickup=Starbucks",
  secondaryLabel: "Ride Option",
  secondaryPath: "/request?type=ride",
};

function getRequestIcon(serviceType: string) {
  if (serviceType === "food") return UtensilsCrossed;
  if (serviceType === "ride") return Car;
  return DollarSign;
}

function getRequestAccentClassName(serviceType: string) {
  if (serviceType === "ride") return "bg-[var(--gold-soft)] text-[var(--brand-maroon)]";
  if (serviceType === "food") return "bg-[var(--surface-tint)] text-[var(--brand-maroon)]";
  return "bg-[var(--surface-tint)] text-[var(--brand-accent)]";
}

function QuickActionCard({ action, onOpen }: { action: QuickAction; onOpen: (path: string) => void }) {
  const Icon = action.icon;

  return (
    <button
      className="rounded-[1.75rem] border-2 border-[var(--border)] bg-[var(--surface)] p-0 text-left shadow-[0_8px_20px_rgba(45,34,39,0.05)] transition-all hover:-translate-y-1 hover:border-[var(--brand-accent)] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-gold)] focus-visible:ring-offset-2"
      onClick={() => onOpen(action.path)}
      type="button"
    >
      <div className="flex h-full flex-col gap-5 p-5 sm:gap-6 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", action.accentClassName)}>
            <Icon className="h-6 w-6" />
          </div>
          <Badge className="hidden sm:inline-flex" variant="secondary">
            {action.detail}
          </Badge>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--ink)]">{action.label}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{action.description}</p>
        </div>

        <div className="flex items-center justify-between text-sm font-semibold text-[var(--brand-maroon)]">
          <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1">Tap to open</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </div>
      </div>
    </button>
  );
}

function RequestCard({ request, onOpen }: { request: RequestRecord; onOpen: (id: string) => void }) {
  const Icon = getRequestIcon(request.serviceType);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              getRequestAccentClassName(request.serviceType),
            )}
          >
            <Icon className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback>{request.requesterName[0]}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-[var(--ink)]">{request.requesterName}</span>
              <Badge className="text-xs" variant="secondary">
                {request.status === "accepted" ? "Accepted" : "Open"}
              </Badge>
            </div>

            <p className="mb-2 text-sm text-[var(--ink)]">
              {request.pickup}
              {request.destination ? ` -> ${request.destination}` : ""}
            </p>

            <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {request.destination || "Campus pickup"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {request.timeAgo}
              </span>
              <span className="flex items-center gap-1 font-semibold text-green-700">
                <DollarSign className="h-3 w-3" />${request.payment}
              </span>
            </div>
          </div>

          <Button className="w-full sm:w-auto sm:self-center" onClick={() => onOpen(request.id)}>
            {request.status === "accepted" ? "Open Chat" : "View"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function buildRepeatPath(request: CampusSnapshot["myRecentRequests"][number]) {
  const params = new URLSearchParams({
    type: request.serviceType,
    pickup: request.pickup,
    destination: request.destination || "",
    payment: request.payment || "",
    notes: request.notes || "",
  });

  return `/request?${params.toString()}`;
}

export function Home() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [campusSnapshot, setCampusSnapshot] = useState<CampusSnapshot | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const previousRequestState = useRef<Record<string, string>>({});
  const preferredView = getStoredView();
  const requestSectionTitle = "Your Orders";
  const requestSectionEmptyState = "You have not placed any orders yet.";

  useEffect(() => {
    if (preferredView === "courier") {
      navigate("/driver-feed", { replace: true });
      return;
    }

    async function loadDashboard() {
      if (!token) return;

      try {
        setIsLoadingDashboard(true);
        setDashboardError("");
        const response = await api.bootstrap(token);
        setRequests(
          response.requests
            .filter((entry) => entry.userId === response.user.id)
            .sort((left, right) => right.timeAgo.localeCompare(left.timeAgo)),
        );
        setCampusSnapshot(response.campusSnapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load requests.";
        setDashboardError(message);
        toast.error(message);
      } finally {
        setIsLoadingDashboard(false);
      }
    }

    void loadDashboard();
  }, [navigate, preferredView, token]);

  useEffect(() => {
    if (!token || preferredView !== "requester") {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.getRequests(token, "mine");
        setRequests(response.requests);

        const nextState = Object.fromEntries(
          response.requests.map((request) => [
            request.id,
            `${request.status}:${request.foodReady ? "ready" : "waiting"}`,
          ]),
        );

        const previousState = previousRequestState.current;
        previousRequestState.current = nextState;

        if (!Object.keys(previousState).length) {
          return;
        }

        for (const request of response.requests) {
          const before = previousState[request.id];
          const now = nextState[request.id];

          if (!before || before === now || !user?.notificationsEnabled || !canSendBrowserNotifications()) {
            continue;
          }

          if (request.status === "accepted") {
            sendBrowserNotification("A courier accepted your order", {
              body: `${request.pickup} is now being handled.`,
            });
          } else if (request.foodReady) {
            sendBrowserNotification("Your food order is marked ready", {
              body: "The courier can head to pickup now.",
            });
          }
        }
      } catch {
        // quiet background polling for a lightweight prototype
      }
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [preferredView, token, user]);

  return (
    <div className="min-h-screen bg-transparent pb-28 sm:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-white sm:rounded-[2rem]">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-5 sm:p-6 lg:p-8">
              <Badge className="mb-3" variant="secondary">
                {heroCopy.badge}
              </Badge>
              <h1 className="max-w-2xl text-2xl font-bold leading-tight text-[var(--ink)] sm:text-5xl">
                Food delivery for late nights, study sessions, and dorm days.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Hi, {user?.name.split(" ")[0]}. Whether you are studying, working, or staying in your dorm, you can check live courier activity, reorder faster, and get food delivered without leaving your spot.
              </p>

              <div className="mt-6 hidden flex-col gap-3 sm:flex sm:flex-row sm:flex-wrap">
                <Button onClick={() => navigate(heroCopy.primaryPath)} size="lg">
                  {heroCopy.primaryLabel}
                </Button>
                <Button onClick={() => navigate(heroCopy.secondaryPath)} size="lg" variant="secondary">
                  {heroCopy.secondaryLabel}
                </Button>
                <Button onClick={() => openGetMobile()} size="lg" variant="outline">
                  Order Food In GET
                </Button>
              </div>

              <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-3">
                <div className="rounded-2xl bg-[var(--surface-tint)] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Couriers online</p>
                  <p className="mt-1 font-semibold text-[var(--ink)]">{campusSnapshot?.onlineCouriers ?? 0} active now</p>
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-tint)] p-5 sm:p-6 lg:p-8">
              <div className="rounded-[1.75rem] bg-[var(--brand-maroon)] p-5 text-white shadow-lg">
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">How it works</p>
                <div className="mt-4 space-y-4">
                  {howItWorks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-3 rounded-2xl bg-white/10 p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{item.title}</p>
                          <p className="mt-1 text-sm leading-5 text-white/78">{item.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <Card className="border-[var(--border)] bg-white">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Faster Than Last Time</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Repeat a recent request</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Skip retyping the same pickup, dorm, and fee when you already know what you want for tonight.
                  </p>
                </div>
                <Repeat2 className="h-5 w-5 text-[var(--brand-accent)]" />
              </div>

              <div className="mt-5 space-y-3">
                {campusSnapshot?.myRecentRequests.length ? (
                  campusSnapshot.myRecentRequests.map((request) => (
                    <button
                      key={request.id}
                      className="flex w-full items-center justify-between gap-4 rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--brand-accent)]"
                      onClick={() => navigate(buildRepeatPath(request))}
                      type="button"
                    >
                      <div>
                        <p className="font-medium text-[var(--ink)]">{request.pickup}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {request.destination || "Campus drop-off"} • ${request.payment}
                        </p>
                      </div>
                      <span className="rounded-full bg-[var(--surface-tint)] px-3 py-1 text-sm font-semibold text-[var(--brand-maroon)]">
                        Repeat
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                    Once you place a request, your usual pickup flow will show up here for one-tap reuse.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Choose what you need</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Start with food delivery, with rides kept as a secondary option.</p>
            </div>
            <Button className="hidden sm:inline-flex" onClick={() => navigate("/request")} variant="ghost">
              Open request form
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {quickActions.map((action) => (
              <QuickActionCard key={action.label} action={action} onOpen={(path) => navigate(path)} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[var(--ink)]">{requestSectionTitle}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Your active and recent requests stay here.</p>
            </div>
          </div>

          <div className="space-y-4">
            {dashboardError ? (
              <Card>
                <CardContent className="p-6 text-sm text-rose-900">{dashboardError}</CardContent>
              </Card>
            ) : null}

            {isLoadingDashboard ? (
              <Card>
                <CardContent className="p-8 text-center text-[var(--muted)]">Loading your dashboard...</CardContent>
              </Card>
            ) : null}

            {!isLoadingDashboard && !dashboardError ? requests.map((request) => (
              <RequestCard key={request.id} onOpen={(id) => navigate(`/messages/${id}`)} request={request} />
            )) : null}
          </div>

          {!isLoadingDashboard && !dashboardError && requests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-[var(--muted)]">{requestSectionEmptyState}</CardContent>
            </Card>
          ) : null}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 p-3 shadow-[0_-12px_40px_rgba(45,34,39,0.12)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_1fr_auto] gap-2">
          <Button aria-label="Request food delivery" className="min-h-12 rounded-2xl" onClick={() => navigate(heroCopy.primaryPath)} size="lg">
            Food
          </Button>
          <Button aria-label="Request a ride" className="min-h-12 rounded-2xl" onClick={() => navigate(heroCopy.secondaryPath)} size="lg" variant="secondary">
            Ride
          </Button>
          <Button aria-label="Open GET mobile ordering" className="min-h-12 rounded-2xl px-4" onClick={() => openGetMobile()} size="lg" variant="outline">
            GET
          </Button>
        </div>
      </div>
    </div>
  );
}
