// File purpose:
// Main requester landing page and lightweight dashboard.
// Shows the simplest entry points for common student actions and the current request list.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Car,
  Package,
  UtensilsCrossed,
  BookOpen,
  MapPin,
  Clock,
  DollarSign,
  Shield,
} from "lucide-react";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { api, type RequestRecord } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "../components/ui/sonner";
import { cn } from "../lib/cn";
import { getStoredView, setStoredView } from "../lib/viewMode";
import { appQuotes } from "../lib/content";
import { openGetMobile } from "../lib/getMobile";
import { canSendBrowserNotifications, sendBrowserNotification } from "../lib/notifications";
const KOSHER_ORDER_PATH = "/request?type=food&pickup=East%20Cafe";

type QuickAction = {
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  accentClassName: string;
};

const quickActions: QuickAction[] = [
  {
    label: "Order Food",
    description: "Do not waste precious study time. Get your food brought straight to you.",
    path: "/request?type=food&pickup=Starbucks",
    icon: UtensilsCrossed,
    accentClassName: "bg-[var(--brand-maroon)] text-white",
  },
  {
    label: "Dollar Run",
    description: "Already ordered from a campus restaurant with GET? Let another student use extra Discount Dollars and bring it over.",
    path: "/request?type=discount",
    icon: DollarSign,
    accentClassName: "bg-[var(--gold-soft)] text-[var(--brand-accent)]",
  },
  {
    label: "Order a Ride",
    description: "Cold out? Raining? Get a quick ride across campus without the long walk.",
    path: "/request?type=ride",
    icon: Car,
    accentClassName: "bg-[var(--gold-soft)] text-[var(--brand-maroon)]",
  },
  {
    label: "Moving Help",
    description: "Need help carrying bins, boxes, or dorm stuff? Get an extra set of hands.",
    path: "/request?type=moving",
    icon: Package,
    accentClassName: "bg-[var(--surface-tint)] text-[var(--brand-maroon)]",
  },
  {
    label: "Find Tutor",
    description: "Stuck before an exam? Find another student who can help you fast.",
    path: "/request?type=tutor",
    icon: BookOpen,
    accentClassName: "bg-[var(--gold-soft)] text-[var(--brand-maroon)]",
  },
  {
    label: "Campus Map",
    description: "See the real campus drop-off zones before you post or accept a request.",
    path: "/map",
    icon: MapPin,
    accentClassName: "bg-[var(--surface-tint)] text-[var(--brand-accent)]",
  },
];

const mainQuickActions = quickActions.filter((action) =>
  ["Order Food", "Dollar Run", "Order a Ride"].includes(action.label),
);

const extraQuickActions = quickActions.filter((action) =>
  ["Moving Help", "Find Tutor", "Campus Map"].includes(action.label),
);

const heroCopy = {
  badge: "UAlbany Campus Help",
  title: "Order food, rides, and campus help without the extra campus trip.",
  body: "Skip another frustrating walk back to the Campus Center and have another student bring what you need where you already are.",
  subtext: "Built for the long class days, rainy nights, and finals weeks when one more trip across campus feels like too much.",
  primaryLabel: "Order Food",
  primaryPath: "/request?type=food&pickup=Starbucks",
};

function getRequestIcon(serviceType: string) {
  if (serviceType === "food") return UtensilsCrossed;
  if (serviceType === "ride") return Car;
  if (serviceType === "moving") return Package;
  return BookOpen;
}

function getRequestAccentClassName(serviceType: string) {
  if (serviceType === "ride") return "bg-[var(--gold-soft)] text-[var(--brand-maroon)]";
  if (serviceType === "food") return "bg-[var(--surface-tint)] text-[var(--brand-maroon)]";
  if (serviceType === "moving") return "bg-[var(--gold-soft)] text-[var(--brand-accent)]";
  return "bg-[var(--surface-tint)] text-[var(--brand-accent)]";
}

function QuickActionCard({ action, onOpen }: { action: QuickAction; onOpen: (path: string) => void }) {
  const Icon = action.icon;

  return (
    <button
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
      onClick={() => onOpen(action.path)}
      type="button"
    >
      <div className="flex h-full flex-col justify-between gap-4 p-5">
        <div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-2xl", action.accentClassName)}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-[var(--ink)]">{action.label}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{action.description}</p>
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
  const [searchQuery, setSearchQuery] = useState("");
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

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;

    return requests.filter((request) =>
      [request.serviceType, request.requesterName, request.pickup, request.destination, request.payment].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [requests, searchQuery]);

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-6 rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm">
          <div className="mb-5 rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(92,29,54,0.97),rgba(92,29,54,0.84),rgba(199,162,74,0.72))] px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-[0.28em] text-white/75">UAlbany Student Courier Network</p>
            <h2 className="mt-2 text-2xl font-semibold">{heroCopy.title}</h2>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-center md:text-left">
              <Badge className="mb-3" variant="secondary">
                {heroCopy.badge}
              </Badge>
              <h1 className="text-3xl font-bold text-[var(--ink)]">
                Hi, {user?.name.split(" ")[0]}
              </h1>
              <p className="mt-2 max-w-2xl text-[var(--muted)]">
                {heroCopy.body}
              </p>
              <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
                {heroCopy.subtext}
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:items-end">
              <Button
                onClick={() => openGetMobile()}
                size="lg"
                variant="secondary"
              >
                Open GET Ordering
              </Button>
              <Button
                onClick={() => navigate(heroCopy.requester.primaryPath)}
                size="lg"
              >
                {heroCopy.primaryLabel}
              </Button>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              className="rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-[var(--brand-accent)] transition hover:border-[var(--brand-accent)] hover:bg-white"
              onClick={() => {
                if (!user?.ualbanyIdUploaded) {
                  navigate("/profile?setup=courier");
                  return;
                }
                setStoredView("courier");
                navigate("/driver-feed");
              }}
              type="button"
            >
              Want to make extra cash? No car needed.
            </button>
          </div>
        </section>

        <section className="mb-8">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="overflow-hidden border-none bg-[linear-gradient(120deg,rgba(92,29,54,0.98),rgba(122,47,96,0.92),rgba(199,162,74,0.86))] text-white shadow-sm">
              <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/75">Campus Center to Campus Life</p>
                  <h2 className="mt-2 text-2xl font-bold">Get what you need without the back-and-forth around campus.</h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/85">
                    Food, rides, and small campus help from other UAlbany students who are already nearby.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm">
                    <UtensilsCrossed className="h-4 w-4" />
                    Campus Center food
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    Real campus drop-offs
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm">
                    <Shield className="h-4 w-4" />
                    UAlbany-only access
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-[var(--border)]">
                <CardContent className="p-5 text-center">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--muted)]">Welcome Back</p>
                  <h2 className="mt-2 text-2xl font-bold text-[var(--ink)]">Stop wasting time on the same long campus trip.</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Order food, rides, and campus help in one place when you are busy, tired, or stuck far from the Campus Center.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => navigate("/request?type=food&pickup=Starbucks")} size="lg">
                      Order Food
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-2xl bg-[var(--surface-tint)] px-5 py-4 text-center">
                <p className="text-sm italic text-[var(--muted)]">
                  "{appQuotes.requester}"
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  className="text-xs font-medium text-[var(--muted)] underline-offset-4 transition hover:text-[var(--brand-accent)] hover:underline"
                  onClick={() => navigate(KOSHER_ORDER_PATH)}
                  type="button"
                >
                  Need kosher food delivery? Start a small East Cafe order.
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              className="h-12 pl-10 text-base"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search your orders, pickup spots, and campus drop-offs"
              value={searchQuery}
            />
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-[var(--ink)]">Quick Actions</h2>
          <Tabs defaultValue="main">
            <TabsList className="mb-4 w-full sm:w-auto">
              <TabsTrigger className="flex-1 sm:flex-none" value="main">
                Main Services
              </TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="more">
                More Help
              </TabsTrigger>
            </TabsList>

            <TabsContent value="main">
              <div className="mb-3 rounded-2xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                Order Food, Discount Dollar restaurant runs, and Order a Ride are the fastest ways to get help.
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {mainQuickActions.map((action) => (
                  <QuickActionCard key={action.label} action={action} onOpen={(path) => navigate(path)} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="more">
              <div className="mb-3 rounded-2xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                These are extra tools. Most students only need the first tab.
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {extraQuickActions.map((action) => (
                  <QuickActionCard key={action.label} action={action} onOpen={(path) => navigate(path)} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--ink)]">{requestSectionTitle}</h2>
            <Button onClick={() => navigate("/map")} variant="link">
              View Activity Map
            </Button>
          </div>

          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <RequestCard key={request.id} onOpen={(id) => navigate(`/messages/${id}`)} request={request} />
            ))}
          </div>

          {filteredRequests.length === 0 ? (
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
