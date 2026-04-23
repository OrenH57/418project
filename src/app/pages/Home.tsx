// File purpose:
// Main requester landing page and lightweight dashboard.
// Shows the simplest entry points for common student actions and the current request list.

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
  Sparkles,
  Store,
  TimerReset,
  UtensilsCrossed,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { api, type RequestRecord } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "../components/ui/sonner";
import { cn } from "../lib/cn";
import { getStoredView } from "../lib/viewMode";
import { openGetMobile } from "../lib/getMobile";
import { canSendBrowserNotifications, sendBrowserNotification } from "../lib/notifications";

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
    description: "Order in GET, then send a delivery request here.",
    detail: "Most popular",
    path: "/request?type=food&pickup=Starbucks",
    icon: UtensilsCrossed,
    accentClassName: "bg-[var(--brand-maroon)] text-white",
  },
  {
    label: "Order a Ride",
    description: "Request a quick ride across campus.",
    detail: "Fastest option",
    path: "/request?type=ride",
    icon: Car,
    accentClassName: "bg-[var(--gold-soft)] text-[var(--brand-maroon)]",
  },
];

const howItWorks = [
  {
    title: "Order in GET",
    body: "Place your food order first so the courier knows it is ready for pickup.",
    icon: Store,
  },
  {
    title: "Send the delivery request",
    body: "Choose your drop-off area, add the screenshot, and set the delivery fee.",
    icon: Sparkles,
  },
  {
    title: "Track everything here",
    body: "Open messages and updates from the same page after you post it.",
    icon: TimerReset,
  },
];

const heroCopy = {
  badge: "UAlbany Delivery And Rides",
  primaryLabel: "Order Food",
  primaryPath: "/request?type=food&pickup=Starbucks",
  secondaryLabel: "Get a Ride",
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
      <div className="flex h-full flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", action.accentClassName)}>
            <Icon className="h-6 w-6" />
          </div>
          <Badge variant="secondary">{action.detail}</Badge>
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
        <div className="flex items-start gap-4">
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
                <DollarSign className="h-3 w-3" />
                ${request.payment}
              </span>
            </div>
          </div>

          <Button className="self-center" onClick={() => onOpen(request.id)}>
            {request.status === "accepted" ? "Open Chat" : "View"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const previousRequestState = useRef<Record<string, string>>({});
  const preferredView = getStoredView();
  const requestMode = "mine";
  const requestSectionTitle = "Your Orders";
  const requestSectionEmptyState = "You have not placed any orders yet.";

  useEffect(() => {
    if (preferredView === "courier") {
      navigate("/driver-feed", { replace: true });
      return;
    }

    async function loadRequests() {
      if (!token) return;

      try {
        const response = await api.getRequests(token, requestMode);
        setRequests(response.requests);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load requests.");
      }
    }

    void loadRequests();
  }, [navigate, preferredView, requestMode, token]);

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
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-6 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-white">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-5 sm:p-6 lg:p-8">
              <Badge className="mb-3" variant="secondary">
                {heroCopy.badge}
              </Badge>
              <h1 className="max-w-2xl text-3xl font-bold leading-tight text-[var(--ink)] sm:text-5xl">
                Easy campus food delivery and rides in a couple taps.
              </h1>
              <p className="mt-3 max-w-2xl text-[var(--muted)]">
                Hi, {user?.name.split(" ")[0]}. Pick what you need, send the request, and follow updates from one simple page.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button onClick={() => navigate(heroCopy.primaryPath)} size="lg">
                  {heroCopy.primaryLabel}
                </Button>
                <Button onClick={() => navigate(heroCopy.secondaryPath)} size="lg" variant="secondary">
                  {heroCopy.secondaryLabel}
                </Button>
                <Button onClick={() => openGetMobile()} size="lg" variant="outline">
                  Open GET Ordering
                </Button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[var(--surface-tint)] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Most used</p>
                  <p className="mt-1 font-semibold text-[var(--ink)]">Food delivery</p>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Best for</p>
                  <p className="mt-1 font-semibold text-[var(--ink)]">Busy class days</p>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Simple flow</p>
                  <p className="mt-1 font-semibold text-[var(--ink)]">Order, request, track</p>
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
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Choose what you need</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Start from a big category instead of a search box.</p>
            </div>
            <Button className="hidden sm:inline-flex" onClick={() => navigate("/request")} variant="ghost">
              Open request form
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            {requests.map((request) => (
              <RequestCard key={request.id} onOpen={(id) => navigate(`/messages/${id}`)} request={request} />
            ))}
          </div>

          {requests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-[var(--muted)]">
                {requestSectionEmptyState}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  );
}
