// File purpose:
// Live admin moderation page for the prototype.
// Lets campus admins review flagged requests, remove unsafe listings, and suspend repeat offenders.

import { useEffect, useState } from "react";
import { AlertTriangle, ChartNoAxesColumn, Shield, Trash2, UserX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { api, type AdminOverview, type RequestRecord, type User } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";

function RequestModerationCard({
  request,
  onFlag,
  onRemove,
  onClear,
}: {
  request: RequestRecord;
  onFlag: (request: RequestRecord) => void;
  onRemove: (request: RequestRecord) => void;
  onClear: (request: RequestRecord) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-[var(--ink)]">{request.requesterName}</p>
            <Badge variant="outline">{request.serviceType === "ride" ? "Ride" : "Food Delivery"}</Badge>
            <Badge variant="secondary">{request.status}</Badge>
            {request.moderationStatus === "removed" ? <Badge>Removed</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-[var(--ink)]">
            {request.pickup} to {request.destination}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Posted {request.timeAgo} for ${request.payment}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">{request.notes || "No extra notes."}</p>
          {request.flaggedReason ? (
            <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-amber-900">
              Flag reason: {request.flaggedReason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {request.moderationStatus !== "flagged" ? (
            <Button onClick={() => onFlag(request)} size="sm" variant="secondary">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Flag
            </Button>
          ) : null}
          {request.moderationStatus !== "removed" ? (
            <Button onClick={() => onRemove(request)} size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          ) : null}
          {request.moderationStatus !== "clear" ? (
            <Button onClick={() => onClear(request)} size="sm" variant="outline">
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SuspensionCard({
  user,
  onSuspend,
}: {
  user: User;
  onSuspend: (user: User) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-[var(--ink)]">{user.name}</p>
          <Badge variant="outline">{user.role}</Badge>
          {user.suspended ? <Badge>Suspended</Badge> : <Badge variant="secondary">Active</Badge>}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
        {user.suspendedReason ? (
          <p className="mt-2 text-sm text-amber-900">Reason: {user.suspendedReason}</p>
        ) : null}
      </div>
      <Button onClick={() => onSuspend(user)} size="sm" variant={user.suspended ? "outline" : "secondary"}>
        <UserX className="mr-2 h-4 w-4" />
        {user.suspended ? "Unsuspend" : "Suspend"}
      </Button>
    </div>
  );
}

export function AdminDashboard() {
  const { token, user } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOverview() {
    if (!token) return;

    try {
      setError("");
      const response = await api.getAdminOverview(token);
      setOverview(response);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load admin tools.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [token]);

  async function handleModeration(request: RequestRecord, action: "flag" | "remove" | "clear") {
    if (!token) return;

    const reason =
      action === "flag"
        ? window.prompt("Why are you flagging this request?", request.flaggedReason || "Needs admin review")
        : action === "remove"
          ? window.prompt("Why are you removing this request?", request.flaggedReason || "Unsafe or inappropriate listing")
          : "";

    if ((action === "flag" || action === "remove") && reason === null) {
      return;
    }

    try {
      await api.moderateRequest(token, request.id, {
        action,
        reason: reason || undefined,
      });
      toast.success(action === "remove" ? "Request removed." : action === "flag" ? "Request flagged." : "Request cleared.");
      await loadOverview();
    } catch (moderationError) {
      toast.error(moderationError instanceof Error ? moderationError.message : "Moderation action failed.");
    }
  }

  async function handleSuspension(targetUser: User) {
    if (!token) return;

    const nextSuspended = !targetUser.suspended;
    const reason = nextSuspended
      ? window.prompt("Why are you suspending this account?", targetUser.suspendedReason || "Repeated safety violations")
      : "";

    if (nextSuspended && reason === null) {
      return;
    }

    try {
      await api.suspendUser(token, targetUser.id, {
        suspended: nextSuspended,
        reason: reason || undefined,
      });
      toast.success(nextSuspended ? "User suspended." : "User unsuspended.");
      await loadOverview();
    } catch (suspensionError) {
      toast.error(suspensionError instanceof Error ? suspensionError.message : "Suspension update failed.");
    }
  }

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card>
          <CardContent className="p-6 text-sm text-rose-900">
            Only admin accounts can access moderation tools.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 rounded-[1.75rem] border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Control Center</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--ink)]">Admin Dashboard</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Review blocked-keyword hits, remove unsafe listings, and suspend repeat offenders.
          </p>
        </div>

        {error ? (
          <Card className="mb-6">
            <CardContent className="p-5 text-sm text-rose-900">{error}</CardContent>
          </Card>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-5">
          {[
            { label: "Active Users", value: overview?.metrics.activeUsers ?? 0, icon: Shield },
            { label: "Open Requests", value: overview?.metrics.openRequests ?? 0, icon: ChartNoAxesColumn },
            { label: "Flagged Cases", value: overview?.metrics.flaggedCases ?? 0, icon: AlertTriangle },
            { label: "Suspended Users", value: overview?.metrics.suspendedUsers ?? 0, icon: UserX },
            { label: "Visible Volume", value: overview?.metrics.grossVolume ?? "$0", icon: ChartNoAxesColumn },
          ].map((item) => (
            <Card key={item.label} className="bg-white">
              <CardContent className="p-5">
                <item.icon className="mb-4 h-5 w-5 text-[var(--brand-maroon)]" />
                <p className="text-sm text-[var(--muted)]">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Flagged moderation queue</CardTitle>
              <CardDescription>
                Keyword hits and manually reviewed requests show up here first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <p className="text-sm text-[var(--muted)]">Loading moderation queue...</p> : null}
              {!isLoading && overview?.flaggedRequests.length ? (
                overview.flaggedRequests.map((request) => (
                  <RequestModerationCard
                    key={request.id}
                    onClear={(entry) => void handleModeration(entry, "clear")}
                    onFlag={(entry) => void handleModeration(entry, "flag")}
                    onRemove={(entry) => void handleModeration(entry, "remove")}
                    request={request}
                  />
                ))
              ) : null}
              {!isLoading && !overview?.flaggedRequests.length ? (
                <div className="rounded-2xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                  No flagged requests right now.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Suspension controls</CardTitle>
                <CardDescription>
                  Suspend users who repeatedly violate platform rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview?.users.filter((entry) => entry.role !== "admin").map((entry) => (
                  <SuspensionCard key={entry.id} onSuspend={(target) => void handleSuspension(target)} user={entry} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Blocked keywords</CardTitle>
                <CardDescription>Requests containing these terms are auto-flagged.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {overview?.blockedKeywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary">
                    {keyword}
                  </Badge>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Removed listings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview?.moderatedRequests.length ? (
                  overview.moderatedRequests.map((request) => (
                    <RequestModerationCard
                      key={request.id}
                      onClear={(entry) => void handleModeration(entry, "clear")}
                      onFlag={(entry) => void handleModeration(entry, "flag")}
                      onRemove={(entry) => void handleModeration(entry, "remove")}
                      request={request}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                    Nothing has been removed yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
