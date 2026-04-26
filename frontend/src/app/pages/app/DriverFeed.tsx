// File purpose:
// Courier landing page. Shows open jobs, simple filters, and the main accept-job flow.
// This file keeps the courier UX readable while relying on small helper functions for display logic.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Clock,
  DollarSign,
  Car,
  UtensilsCrossed,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { api, type RequestRecord } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { getRequestZoneLabel } from "../../lib/campusMap";
import { getStoredView } from "../../lib/viewMode";
import { canSendBrowserNotifications, sendBrowserNotification } from "../../lib/notifications";

const typeLabels: Record<string, string> = {
  food: "Food Delivery",
  ride: "Ride",
};

export function DriverFeed() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const preferredView = getStoredView();
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("time");
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [acceptingRequestId, setAcceptingRequestId] = useState("");
  const knownOpenRequestIds = useRef<string[]>([]);
  const acceptingRequestRef = useRef("");

  useEffect(() => {
    if (preferredView === "requester") {
      navigate("/app", { replace: true });
      return;
    }

    async function loadRequests() {
      if (!token) return;

      try {
        const response = await api.getRequests(token, "courier");
        setRequests(response.requests);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load courier feed.");
      }
    }

    void loadRequests();
  }, [navigate, preferredView, token]);

  useEffect(() => {
    if (!token || preferredView !== "courier" || !user?.courierOnline) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await api.getRequests(token, "courier");
        setRequests(response.requests);

        const openRequests = response.requests.filter((request) => request.status === "open");
        const openIds = openRequests.map((request) => request.id);

        if (!knownOpenRequestIds.current.length) {
          knownOpenRequestIds.current = openIds;
          return;
        }

        const newOpenRequests = openRequests.filter((request) => !knownOpenRequestIds.current.includes(request.id));
        knownOpenRequestIds.current = openIds;

        if (newOpenRequests.length && user.notificationsEnabled && canSendBrowserNotifications()) {
          const newest = newOpenRequests[0];
          sendBrowserNotification("New campus job available", {
            body: `${newest.pickup} to ${newest.destination || "campus drop-off"} for $${newest.payment}`,
          });
        }
      } catch {
        // keep polling quiet in the background
      }
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [preferredView, token, user?.courierOnline, user?.notificationsEnabled]);

  const filteredRequests = useMemo(() => {
    return [...requests]
      .filter((request) => request.serviceType !== "discount")
      .filter((request) => filterType === "all" || request.serviceType === filterType)
      .sort((left, right) => {
        if (sortBy === "payment") {
          return Number.parseFloat(right.payment) - Number.parseFloat(left.payment);
        }
        if (sortBy === "distance") {
          return left.pickup.localeCompare(right.pickup);
        }
        return right.timeAgo.localeCompare(left.timeAgo);
      });
  }, [filterType, requests, sortBy]);

  const activeJobs = filteredRequests.filter((request) => request.status === "accepted").length;
  const estimatedEarnings = filteredRequests.reduce((total, request) => total + Number.parseFloat(request.payment), 0);

  function getTypeIcon(type: string) {
    if (type === "food") return UtensilsCrossed;
    if (type === "ride") return Car;
    return DollarSign;
  }

  function getTypeColor(type: string) {
    switch (type) {
      case "ride":
        return "bg-[var(--gold-soft)] text-[var(--brand-maroon)]";
      case "food":
        return "bg-[var(--surface-tint)] text-[var(--brand-maroon)]";
      default:
        return "bg-[var(--surface-tint)] text-[var(--brand-accent)]";
    }
  }

  async function handleAccept(requestId: string) {
    if (!token) return;
    if (acceptingRequestRef.current) return;
    acceptingRequestRef.current = requestId;

    try {
      setAcceptingRequestId(requestId);
      await api.acceptRequest(token, requestId);
      const refreshed = await api.getRequests(token, "courier");
      setRequests(refreshed.requests);
      toast.success("Request accepted. Open the chat to coordinate pickup.");
      navigate(`/messages/${requestId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept request.");
    } finally {
      acceptingRequestRef.current = "";
      setAcceptingRequestId("");
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Courier Jobs</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Browse open jobs, accept one, and message the student.
          </p>
        </div>

        {!user?.foodSafetyVerified ? (
          <Card className="mb-6 border-[var(--brand-accent)] bg-[var(--gold-soft)]/40">
            <CardContent className="p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--brand-accent)]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-[var(--ink)]">Courier prototype mode</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                You can browse jobs right away. To accept food deliveries, verify your campus email in Profile first.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                <Button onClick={() => navigate("/profile")}>Open Profile</Button>
                <Button onClick={() => navigate("/app")} variant="secondary">
                  Stay On User Side
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mb-6 border-[var(--border)] bg-white">
          <CardContent className="flex flex-col items-center justify-between gap-4 p-5 text-center md:flex-row md:text-left">
            <div>
              <p className="font-semibold text-[var(--ink)]">Online courier mode</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {user?.courierOnline
                  ? "You are online. Keep this page open and new jobs can reach you."
                  : "Go to Profile to turn on online mode if you want notifications for new jobs."}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-[var(--ink)]">
              <Bell className="h-4 w-4 text-[var(--brand-accent)]" />
              {user?.courierOnline ? "Online for new jobs" : "Offline right now"}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 border-none bg-gradient-to-r from-[#fdf2dc] to-[#f3e8f6]">
          <CardContent className="p-4">
            <div className="flex justify-around text-center">
              <div>
                <p className="text-2xl font-bold text-[var(--brand-accent)]">{filteredRequests.length}</p>
                <p className="text-xs text-[var(--muted)]">Open Jobs</p>
              </div>
              <div className="border-l border-[var(--border)]" />
              <div>
                <p className="text-2xl font-bold text-[var(--brand-maroon)]">{activeJobs}</p>
                <p className="text-xs text-[var(--muted)]">Accepted</p>
              </div>
              <div className="border-l border-[var(--border)]" />
              <div>
                <p className="text-2xl font-bold text-[var(--brand-maroon)]">${estimatedEarnings.toFixed(0)}</p>
                <p className="text-xs text-[var(--muted)]">Total Visible Pay</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <div className="w-full sm:max-w-[340px]">
            <Select onValueChange={setFilterType} value={filterType}>
              <SelectTrigger>
                <SelectValue placeholder="All Job Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Types</SelectItem>
                <SelectItem value="food">Order Pickups</SelectItem>
                <SelectItem value="ride">Rides</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[180px]">
            <Select onValueChange={setSortBy} value={sortBy}>
              <SelectTrigger>
                <SelectValue placeholder="Newest First" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">Newest First</SelectItem>
                <SelectItem value="payment">Highest Pay</SelectItem>
                <SelectItem value="distance">Pickup A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const Icon = getTypeIcon(request.serviceType);

            return (
              <Card key={request.id} className="transition-shadow hover:shadow-lg">
                <CardContent className="p-5">
                  <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:items-start lg:text-left">
                    <div className={`${getTypeColor(request.serviceType)} shrink-0 rounded-full p-3`}>
                      <Icon className="h-6 w-6" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback>{request.requesterName[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-[var(--ink)]">{request.requesterName}</span>
                        <Badge variant="outline">{typeLabels[request.serviceType] || "Campus Help"}</Badge>
                        <Badge className="text-xs" variant="secondary">
                          {request.status === "accepted" ? "Accepted" : "Open"}
                        </Badge>
                      </div>

                      <div className="mb-3 space-y-1">
                        <div className="flex items-start justify-center gap-2 text-sm lg:justify-start">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]" />
                          <span className="text-[var(--ink)]">{request.pickup}</span>
                        </div>
                        {request.destination ? (
                          <div className="flex items-start justify-center gap-2 text-sm lg:justify-start">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-maroon)]" />
                            <span className="text-[var(--ink)]">{request.destination}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap justify-center gap-4 text-xs text-[var(--muted)] lg:justify-start">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {request.timeAgo}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {getRequestZoneLabel(request)}
                        </span>
                        {request.orderEta ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            GET Mobile ETA: {request.orderEta}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1 text-sm font-bold text-[var(--brand-accent)]">
                          <DollarSign className="h-4 w-4" />
                          ${request.payment}
                        </span>
                      </div>

                      {request.orderScreenshot ? (
                        <div className="mt-4">
                          <img
                            alt="Uploaded order screenshot"
                            className="max-h-48 rounded-2xl border border-[var(--border)] object-cover"
                            src={request.orderScreenshot}
                          />
                        </div>
                      ) : null}

                      {request.serviceType === "food" ? (
                        <p className="mt-3 text-xs text-[var(--muted)]">
                          Food job: you need a verified campus email to take this one.
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
                        <Button
                          className="rounded-full px-3"
                          onClick={() => navigate(`/messages/${request.id}`)}
                          size="sm"
                          variant="outline"
                        >
                          Details
                        </Button>
                      </div>
                    </div>

                    {request.status === "accepted" ? (
                      <Button className="shrink-0" onClick={() => navigate(`/messages/${request.id}`)}>
                        Open Chat
                      </Button>
                    ) : (
                      <Button
                        className="shrink-0"
                        disabled={Boolean(acceptingRequestId)}
                        onClick={() => void handleAccept(request.id)}
                      >
                        {acceptingRequestId === request.id ? "Accepting..." : "Accept Job"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
