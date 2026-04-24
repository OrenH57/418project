// File purpose:
// Internal campus map view for requesters and couriers.
// Uses a simple campus diagram instead of external map/PDF links so users can stay inside the app.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Clock, DollarSign, MapPin, Navigation, UtensilsCrossed } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { api, type RequestRecord } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { cn } from "../../lib/cn";
import { CampusMapDiagram } from "../../components/maps/CampusMapDiagram";
import { getDefaultPath, getStoredView } from "../../lib/viewMode";
import {
  campusMapNodes,
  campusZones,
  findCampusNodeForRequest,
  getRequestZoneLabel,
  type CampusMapNode,
} from "../../lib/campusMap";

type SummaryStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName: string;
  valueClassName: string;
};

function SummaryCard({ stat }: { stat: SummaryStat }) {
  const Icon = stat.icon;

  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-white/85 shadow-sm", stat.iconClassName)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className={cn("text-2xl font-bold", stat.valueClassName)}>{stat.value}</p>
        <p className="text-xs text-[var(--muted)]">{stat.label}</p>
      </div>
    </div>
  );
}

function CampusNodeCard({
  node,
  active,
  onSelect,
}: {
  node: CampusMapNode;
  active: boolean;
  onSelect: (node: CampusMapNode) => void;
}) {
  return (
    <button
      className={cn(
        "rounded-2xl border px-4 py-4 text-left transition",
        active
          ? "border-[var(--brand-accent)] bg-[var(--surface-tint)] shadow-sm"
          : "border-[var(--border)] bg-white hover:border-[var(--brand-accent)]",
      )}
      onClick={() => onSelect(node)}
      type="button"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-sm font-semibold text-[var(--brand-accent)]">
        {node.shortLabel}
      </div>
      <p className="font-medium text-[var(--ink)]">{node.name}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{node.description}</p>
    </button>
  );
}

function RequestMapCard({
  request,
  active,
  onSelect,
}: {
  request: RequestRecord;
  active: boolean;
  onSelect: (requestId: string) => void;
}) {
  return (
    <button
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition",
        active
          ? "border-[var(--brand-accent)] bg-[var(--surface-tint)] shadow-sm"
          : "border-[var(--border)] bg-white hover:border-[var(--brand-accent)]",
      )}
      onClick={() => onSelect(request.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--brand-accent)]">
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--ink)]">{request.pickup}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{request.destination || "Campus drop-off"}</p>
          </div>
        </div>
        <Badge variant="secondary">{request.status === "accepted" ? "Accepted" : "Open"}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {getRequestZoneLabel(request)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {request.orderEta || request.time}
        </span>
        <span className="flex items-center gap-1 text-[var(--brand-accent)]">
          <DollarSign className="h-3 w-3" />
          ${request.payment}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {request.timeAgo}
        </span>
      </div>
    </button>
  );
}

export function MapView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const preferredView = getStoredView();
  const [selectedNode, setSelectedNode] = useState(campusMapNodes[0]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  useEffect(() => {
    async function loadRequests() {
      if (!token) return;

      try {
        const response = await api.getRequests(token, "courier");
        setRequests(response.requests);

        const requestedId = searchParams.get("request");
        const firstFocusedRequest =
          response.requests.find((request) => request.id === requestedId) ||
          response.requests.find((request) => request.serviceType === "food") ||
          null;

        if (!firstFocusedRequest) return;

        setSelectedRequestId(firstFocusedRequest.id);
        const requestNode = findCampusNodeForRequest(firstFocusedRequest);
        if (requestNode) {
          setSelectedNode(requestNode);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load campus activity.");
      }
    }

    void loadRequests();
  }, [searchParams, token]);

  const foodRequests = useMemo(
    () => requests.filter((request) => request.serviceType === "food"),
    [requests],
  );

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  );

  const activeNodeId = selectedRequest ? findCampusNodeForRequest(selectedRequest)?.id : selectedNode.id;
  const highlightedNodeIds = foodRequests
    .map((request) => findCampusNodeForRequest(request)?.id)
    .filter((value): value is string => Boolean(value));

  const summaryStats: SummaryStat[] = [
    {
      label: "Food runs on map",
      value: foodRequests.length,
      icon: UtensilsCrossed,
      iconClassName: "text-[var(--brand-accent)]",
      valueClassName: "text-[var(--brand-accent)]",
    },
    {
      label: "Total active requests",
      value: requests.length,
      icon: MapPin,
      iconClassName: "text-[var(--brand-maroon)]",
      valueClassName: "text-[var(--brand-maroon)]",
    },
    {
      label: "Campus hotspots",
      value: campusMapNodes.length,
      icon: Navigation,
      iconClassName: "text-[var(--brand-maroon)]",
      valueClassName: "text-[var(--brand-maroon)]",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <header className="border-b border-[var(--border)] bg-white/90">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button onClick={() => navigate(getDefaultPath(preferredView))} size="sm" variant="ghost">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-[var(--ink)]">Campus Activity Map</h1>
                <p className="text-sm text-[var(--muted)]">
                  Simple campus map for dorm, apartment, library, and campus-center handoffs.
                </p>
              </div>
            </div>
            <Badge className="gap-1" variant="secondary">
              <Navigation className="h-3 w-3" />
              Campus Map
            </Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:grid lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3">
                <div>
                  <p className="font-medium text-[var(--ink)]">
                    {selectedRequest ? "Focused on active request" : selectedNode.name}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {selectedRequest
                      ? `${selectedRequest.pickup}${selectedRequest.destination ? ` to ${selectedRequest.destination}` : ""}`
                      : selectedNode.description}
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-2 text-xs font-medium text-[var(--muted)]">
                  Schematic campus map
                </div>
              </div>

              <div className="p-4">
                <CampusMapDiagram
                  activeNodeId={activeNodeId}
                  highlightedNodeIds={highlightedNodeIds}
                  onSelectNode={(node) => {
                    setSelectedRequestId(null);
                    setSelectedNode(node);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {campusMapNodes.map((node) => (
              <CampusNodeCard
                key={node.id}
                active={selectedNode.id === node.id && !selectedRequest}
                node={node}
                onSelect={(nextNode) => {
                  setSelectedRequestId(null);
                  setSelectedNode(nextNode);
                }}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="border-none bg-gradient-to-r from-[#efe4f6] to-[#fdf2dc]">
            <CardContent className="p-4">
              <p className="font-semibold text-[var(--ink)]">How to read this map</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Tap a campus area to see where it sits on campus. If a request is selected, the student&apos;s drop-off
                zone is highlighted so couriers can get oriented fast.
              </p>
            </CardContent>
          </Card>

          <Card className="border-none bg-gradient-to-r from-[#fdf2dc] to-[#f3e8f6]">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {summaryStats.map((stat) => (
                <SummaryCard key={stat.label} stat={stat} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <Tabs defaultValue="requests">
                <TabsList className="w-full">
                  <TabsTrigger className="flex-1" value="requests">
                    Food Requests
                  </TabsTrigger>
                  <TabsTrigger className="flex-1" value="campus">
                    Campus Spots
                  </TabsTrigger>
                </TabsList>

                <TabsContent className="mt-4 space-y-3" value="requests">
                  {foodRequests.length ? (
                    foodRequests.map((request) => (
                      <div key={request.id} className="space-y-2">
                        <RequestMapCard
                          active={selectedRequestId === request.id}
                          onSelect={(requestId) => {
                            setSelectedRequestId(requestId);
                            const requestNode = findCampusNodeForRequest(
                              requests.find((entry) => entry.id === requestId) ?? null,
                            );
                            if (requestNode) {
                              setSelectedNode(requestNode);
                            }
                          }}
                          request={request}
                        />
                        <div className="flex flex-wrap gap-2 px-1">
                          <Button onClick={() => navigate(`/messages/${request.id}`)} size="sm" variant="outline">
                            Open Request Chat
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                      No food requests yet. Create one from the request form to pin it here on the campus map.
                    </div>
                  )}
                </TabsContent>

                <TabsContent className="mt-4 space-y-3" value="campus">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
                    <p className="font-medium text-[var(--ink)]">Residential and academic zones</p>
                    <div className="mt-3 grid gap-2">
                      {campusZones.map((zone) => (
                        <div
                          key={zone.name}
                          className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                        >
                          <p className="font-medium text-[var(--ink)]">{zone.name}</p>
                          <p className="mt-1 text-[var(--muted)]">{zone.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {campusMapNodes.map((node) => (
                    <button
                      key={node.id}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition",
                        selectedNode.id === node.id && !selectedRequest
                          ? "border-[var(--brand-accent)] bg-[var(--surface-tint)] shadow-sm"
                          : "border-[var(--border)] bg-white hover:border-[var(--brand-accent)]",
                      )}
                      onClick={() => {
                        setSelectedRequestId(null);
                        setSelectedNode(node);
                      }}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-sm font-semibold text-[var(--brand-accent)]">
                          {node.shortLabel}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--ink)]">{node.name}</p>
                          <p className="mt-1 text-sm text-[var(--muted)]">{node.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
