// File purpose:
// Main request creation form for food delivery and rides.
// Builds the final request payload and validates the pieces students enter.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, DollarSign, ImagePlus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "../../components/ui/sonner";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  MIN_PAYMENT_OFFER,
  serviceTypes,
  housingLocations,
  formatDeliveryFee,
  formatPaymentTotal,
  getDeliveryFeeForLocation,
  getHelperCopy,
  buildFoodNotes,
  buildHousingDestination,
  getFloorOptions,
  getMeetSpotOptions,
  parseOptionalTip,
} from "../../lib/campusConfig";
import { openGetMobile } from "../../lib/getMobile";

type ServiceButtonProps = {
  active: boolean;
  label: string;
  suggestedPrice: string;
  onClick: () => void;
};

type SectionCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

const REQUEST_IDEMPOTENCY_KEY = "campus-connect-request-idempotency-key";

function createRequestIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ServiceButton({ active, label, suggestedPrice, onClick }: ServiceButtonProps) {
  return (
    <button
      className={`rounded-2xl border p-4 text-left transition ${
        active ? "border-[var(--brand-accent)] bg-[var(--surface-tint)]" : "border-[var(--border)] bg-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <p className="font-semibold text-[var(--ink)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">Suggested: {suggestedPrice}</p>
      {label === "Food Delivery" ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Best when you already ordered in GET and only need delivery.</p>
      ) : null}
      {label === "Discount Dollars (Coming Soon)" ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Incoming feature. Delivery requests are the live flow right now.</p>
      ) : null}
    </button>
  );
}

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-4">
      <div>
        <p className="font-medium text-[var(--ink)]">{title}</p>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function RequestService() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const typeFromUrl = searchParams.get("type") || "food";
  const pickupFromUrl = searchParams.get("pickup") || "";
  const destinationFromUrl = searchParams.get("destination") || "";
  const notesFromUrl = searchParams.get("notes") || "";

  const [serviceType, setServiceType] = useState(typeFromUrl);
  const [pickup, setPickup] = useState(pickupFromUrl);
  const [destination, setDestination] = useState(destinationFromUrl);
  const [timeMode, setTimeMode] = useState<"now" | "schedule">("now");
  const [time, setTime] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [notes, setNotes] = useState(notesFromUrl);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderItems, setOrderItems] = useState("");
  const [orderEta, setOrderEta] = useState("");
  const [orderScreenshot, setOrderScreenshot] = useState("");
  const [estimatedRetailTotal, setEstimatedRetailTotal] = useState("");
  const [restaurants, setRestaurants] = useState<string[]>([]);
  const [housingArea, setHousingArea] = useState("");
  const [housingBuilding, setHousingBuilding] = useState("");
  const [housingFloor, setHousingFloor] = useState("");
  const [housingDetails, setHousingDetails] = useState("");
  const [ridePickupArea, setRidePickupArea] = useState("");
  const [rideDestinationArea, setRideDestinationArea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef("");
  const bootstrapTokenRef = useRef("");
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");

  const needsDestination = serviceType === "ride" || serviceType === "food";
  const helperCopy = useMemo(() => getHelperCopy(serviceType), [serviceType]);
  const selectedService = serviceTypes.find((service) => service.value === serviceType);
  const selectedHousingArea = useMemo(
    () => housingLocations.find((location) => location.id === housingArea) ?? null,
    [housingArea],
  );
  const selectedHousingBuildingOptions = selectedHousingArea?.buildings ?? [];
  const floorOptions = useMemo(() => (selectedHousingArea ? getFloorOptions(selectedHousingArea.id) : []), [selectedHousingArea]);
  const meetSpotOptions = useMemo(
    () => (selectedHousingArea && housingBuilding ? getMeetSpotOptions(selectedHousingArea.id, housingBuilding) : []),
    [housingBuilding, selectedHousingArea],
  );
  const selectedDeliveryLocation = selectedHousingArea
    ? (() => {
      const fee = getDeliveryFeeForLocation(selectedHousingArea.id);
      return fee === null
        ? null
        : {
            id: selectedHousingArea.id,
            label: selectedHousingArea.label,
            fee,
          };
    })()
    : null;
  const selectedDeliveryFee = selectedDeliveryLocation?.fee ?? null;
  const housingDestination = useMemo(
    () =>
      selectedHousingArea
        ? buildHousingDestination(
            selectedHousingArea.label,
            [housingBuilding, housingFloor].filter(Boolean).join(" - "),
            housingDetails,
          )
        : "",
    [housingBuilding, housingDetails, housingFloor, selectedHousingArea],
  );
  const estimatedRetailAmount = Number.parseFloat(estimatedRetailTotal);
  const isFood = serviceType === "food";
  const isRide = serviceType === "ride";
  const isHousingDelivery = isFood;
  const hasOrderScreenshot = Boolean(orderScreenshot);
  const [hasOrderedInGet, setHasOrderedInGet] = useState(!isFood);
  const parsedTip = parseOptionalTip(tipAmount);
  const currentBasePayment = selectedDeliveryFee ?? MIN_PAYMENT_OFFER;
  const currentTipAmount = parsedTip.ok ? parsedTip.amount : 0;
  const currentPaymentTotal = formatPaymentTotal(currentBasePayment, currentTipAmount);

  useEffect(() => {
    setHasOrderedInGet(!isFood);
  }, [isFood]);

  useEffect(() => {
    let isActive = true;

    async function loadBootstrap() {
      if (!token) return;
      if (bootstrapTokenRef.current === token) return;

      bootstrapTokenRef.current = token;

      const response = await api.bootstrap(token);
      if (!isActive) return;

      setRestaurants(response.restaurants);

      if (!pickupFromUrl && response.restaurants[0]) {
        setPickup((currentPickup) => currentPickup || response.restaurants[0]);
      }
    }

    void (async () => {
      try {
        setIsBootstrapping(true);
        setBootstrapError("");
        await loadBootstrap();
      } catch (error) {
        bootstrapTokenRef.current = "";
        if (!isActive) return;
        setBootstrapError(error instanceof Error ? error.message : "Could not load request setup.");
      } finally {
        if (!isActive) return;
        setIsBootstrapping(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [pickupFromUrl, token]);

  useEffect(() => {
    if (serviceType !== "food" && serviceType !== "ride") {
      return;
    }

    if (!housingDestination) {
      return;
    }

    setDestination(housingDestination);
  }, [housingDestination, serviceType]);

  useEffect(() => {
    if (!isRide) {
      return;
    }

    const pickupLabel = ridePickupArea ? `Pickup area: ${ridePickupArea}` : "";
    const destinationLabel = rideDestinationArea ? `Drop-off area: ${rideDestinationArea}` : "";
    const nextDestination = [pickupLabel, destinationLabel].filter(Boolean).join(" -> ");

    if (nextDestination) {
      setDestination(nextDestination);
    }
  }, [isRide, rideDestinationArea, ridePickupArea]);

  useEffect(() => {
    if (!isFood) {
      return;
    }

    setTipAmount("");
  }, [housingArea, isFood]);

  function handleTipChange(value: string) {
    if (/^\d*(\.\d{0,2})?$/.test(value)) {
      setTipAmount(value);
    }
  }

  async function handleScreenshotChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setOrderScreenshot("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image screenshot.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Keep screenshots under 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setOrderScreenshot(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      toast.error("Could not read that screenshot.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    const stopSubmit = (message: string) => {
      submitLockRef.current = false;
      toast.error(message);
    };

    const finalTime = timeMode === "now" ? "Now" : time.trim();
    const trimmedDestination = destination.trim();

    if (!serviceType || !pickup || (needsDestination && !trimmedDestination)) {
      stopSubmit("Please fill in all required fields");
      return;
    }

    if (timeMode === "schedule" && !finalTime) {
      stopSubmit("Choose the date and time if you want to schedule this for later.");
      return;
    }

    if (serviceType === "food" && !hasOrderScreenshot && (!orderNumber.trim() || !orderItems.trim())) {
      stopSubmit("Add the GET Mobile order number and item summary, or upload the GET confirmation screenshot.");
      return;
    }

    if (serviceType === "food" && !housingArea) {
      stopSubmit("Choose the delivery location so CampusConnect can calculate the fee.");
      return;
    }

    if (serviceType === "food" && !selectedDeliveryLocation) {
      stopSubmit("Delivery pricing is not available for that location yet.");
      return;
    }

    const tipValidation = parseOptionalTip(tipAmount);
    if (!tipValidation.ok) {
      stopSubmit("Tips can use dollars and cents, up to two decimal places.");
      return;
    }

    if (serviceType === "food" && !hasOrderedInGet) {
      stopSubmit("Order in GET first, then come back here to request delivery.");
      return;
    }

    const basePayment = serviceType === "food" ? selectedDeliveryLocation?.fee : MIN_PAYMENT_OFFER;
    if (!Number.isFinite(basePayment) || !basePayment || basePayment < MIN_PAYMENT_OFFER) {
      stopSubmit("Delivery fee is missing for this request.");
      return;
    }
    const finalPayment = formatPaymentTotal(basePayment, tipValidation.amount);

    const requestNotes =
      serviceType === "food"
        ? hasOrderScreenshot
          ? [notes.trim() ? `Extra notes: ${notes.trim()}` : "", "GET order screenshot uploaded."]
              .filter(Boolean)
              .join("\n")
        : buildFoodNotes(orderNumber, orderItems, notes)
        : notes.trim();
    const idempotencyKey =
      idempotencyKeyRef.current ||
      sessionStorage.getItem(REQUEST_IDEMPOTENCY_KEY) ||
      createRequestIdempotencyKey();
    idempotencyKeyRef.current = idempotencyKey;
    sessionStorage.setItem(REQUEST_IDEMPOTENCY_KEY, idempotencyKey);

    try {
      setIsSubmitting(true);
      const response = await api.createRequest(token, {
        serviceType,
        pickup,
        destination: trimmedDestination,
        deliveryLocationId: isFood ? housingArea : undefined,
        deliveryLocationLabel: isFood ? selectedHousingArea?.label : undefined,
        time: finalTime,
        payment: finalPayment,
        tipAmount: tipValidation.amount,
        idempotencyKey,
        notes: requestNotes,
        orderEta: orderEta.trim(),
        orderScreenshot,
        estimatedRetailTotal: Number.isFinite(estimatedRetailAmount) ? estimatedRetailAmount : undefined,
        startCheckout: serviceType === "food",
      });

      if (response.checkoutUrl) {
        sessionStorage.removeItem(REQUEST_IDEMPOTENCY_KEY);
        idempotencyKeyRef.current = "";
        window.location.href = response.checkoutUrl;
        return;
      }

      sessionStorage.removeItem(REQUEST_IDEMPOTENCY_KEY);
      idempotencyKeyRef.current = "";
      toast.success("Order placed successfully!");
      window.setTimeout(() => navigate(`/messages/${response.request.id}`), 700);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post request.");
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Button className="mb-3" onClick={() => navigate("/app")} variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{helperCopy.title}</CardTitle>
            <CardDescription>Fill out a short request so another student can deliver or drive for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              {bootstrapError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
                  {bootstrapError}
                </div>
              ) : null}

              <SectionCard
                description="Start by picking what you need."
                title="1. What do you need?"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {serviceTypes.map((type) => (
                    <ServiceButton
                      active={serviceType === type.value}
                      key={type.value}
                      label={type.label}
                      onClick={() => setServiceType(type.value)}
                      suggestedPrice={type.suggestedPrice}
                    />
                  ))}
                </div>
              </SectionCard>

              {isFood ? (
                <SectionCard
                  description="CampusConnect handles the delivery request. Your actual food order still happens in GET first."
                  title="2. Order details"
                >
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
                    <p className="font-medium text-[var(--ink)]">Food delivery flow</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      1. Order food in GET. 2. Save the confirmation screenshot. 3. Come back here to request delivery. 4. Pay and track updates in CampusConnect.
                    </p>
                    <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-[var(--muted)]">
                      CampusConnect does not place the food order for you. It shares pickup and drop-off details with another student courier.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        disabled={isBootstrapping}
                        onClick={() => {
                          openGetMobile();
                          setHasOrderedInGet(true);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Order In GET First
                      </Button>
                      <Button onClick={() => setHasOrderedInGet(true)} size="sm" variant="outline">
                        I Already Ordered In GET
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      GET opens in a new tab so this page stays here. The screenshot is the fastest way to show the courier exactly what to pick up.
                    </p>
                  </div>

                  {hasOrderedInGet ? (
                    <>
                      <div className="space-y-3">
                        <Label htmlFor="order-screenshot">GET screenshot</Label>
                        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] p-4">
                          <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--ink)]" htmlFor="order-screenshot">
                            <ImagePlus className="h-4 w-4 text-[var(--brand-accent)]" />
                            <span>Upload a screenshot of your GET confirmation. This is the easiest option.</span>
                          </label>
                          <Input
                            accept="image/*"
                            className="mt-3"
                            id="order-screenshot"
                            onChange={(event) => void handleScreenshotChange(event)}
                            type="file"
                          />
                        </div>
                        {orderScreenshot ? (
                          <img
                            alt="GET Mobile order screenshot preview"
                            className="max-h-64 rounded-2xl border border-[var(--border)] object-cover"
                            src={orderScreenshot}
                          />
                        ) : null}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="pickup">Restaurant *</Label>
                          <Select onValueChange={setPickup} value={pickup}>
                            <SelectTrigger disabled={isBootstrapping || restaurants.length === 0} id="pickup">
                              <SelectValue placeholder="Select a Campus Center restaurant" />
                            </SelectTrigger>
                            <SelectContent>
                              {restaurants.map((restaurant) => (
                                <SelectItem key={restaurant} value={restaurant}>
                                  {restaurant}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isBootstrapping ? <p className="mt-1 text-xs text-[var(--muted)]">Loading restaurant list...</p> : null}
                        </div>

                        <div>
                          <Label htmlFor="order-number">Order number {hasOrderScreenshot ? "(optional)" : "*"}</Label>
                          <Input
                            id="order-number"
                            onChange={(event) => setOrderNumber(event.target.value)}
                            placeholder={hasOrderScreenshot ? "Optional if screenshot is uploaded" : "GET order number"}
                            value={orderNumber}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
                        <div>
                          <Label htmlFor="order-items">What did you order? {hasOrderScreenshot ? "(optional)" : "*"}</Label>
                          <Textarea
                            id="order-items"
                            onChange={(event) => setOrderItems(event.target.value)}
                            placeholder={
                              hasOrderScreenshot
                                ? "Optional if screenshot is uploaded"
                                : "Short item list for the courier"
                            }
                            rows={3}
                            value={orderItems}
                          />
                        </div>
                        <div>
                          <Label htmlFor="order-eta">Ready time {hasOrderScreenshot ? "(optional)" : ""}</Label>
                          <Input
                            id="order-eta"
                            onChange={(event) => setOrderEta(event.target.value)}
                            placeholder={hasOrderScreenshot ? "Optional if screenshot is uploaded" : "Ready in 10 min"}
                            value={orderEta}
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </SectionCard>
              ) : (
                <SectionCard description="Keep this simple and short." title="2. Main details">
                  <div>
                    <Label htmlFor="pickup">{helperCopy.pickupLabel}</Label>
                    <Input
                      id="pickup"
                      onChange={(event) => setPickup(event.target.value)}
                      placeholder={isRide ? "Ex: Crossgates bus stop, Downtown Albany stop, or specific off-campus pickup" : ""}
                      value={pickup}
                    />
                    {isRide ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Use this for the exact off-campus pickup spot if you are heading into campus.
                      </p>
                    ) : null}
                  </div>
                </SectionCard>
              )}

              {needsDestination ? (
                <div className="space-y-4">
                  {isHousingDelivery ? (
                    <SectionCard
                      description="Pick your area first, then choose the building and meet spot."
                      title="3. Where should it go?"
                    >
                      <div>
                        <p className="text-sm text-[var(--muted)]">
                          Residence halls usually need ID access, so handoff spots stay outside.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="housing-area">Residential Area *</Label>
                          <Select
                            onValueChange={(value) => {
                              setHousingArea(value);
                              setHousingBuilding("");
                              setHousingFloor("");
                              setHousingDetails("");
                            }}
                            value={housingArea}
                          >
                            <SelectTrigger id="housing-area">
                              <SelectValue placeholder="Select a quad or apartment area" />
                            </SelectTrigger>
                            <SelectContent>
                              {housingLocations.map((location) => (
                                <SelectItem key={location.id} value={location.id}>
                                  {location.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="housing-building">Hall / Tower / Cluster</Label>
                          <Select
                            onValueChange={(value) => {
                              setHousingBuilding(value);
                              setHousingFloor("");
                              setHousingDetails("");
                            }}
                            value={housingBuilding}
                          >
                            <SelectTrigger disabled={!selectedHousingArea} id="housing-building">
                              <SelectValue placeholder="Optional building or cluster" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedHousingBuildingOptions.map((building) => (
                                <SelectItem key={building} value={building}>
                                  {building}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {floorOptions.length ? (
                        <div>
                          <Label htmlFor="housing-floor">Floor</Label>
                          <Select
                            onValueChange={setHousingFloor}
                            value={housingFloor}
                          >
                            <SelectTrigger disabled={!housingBuilding} id="housing-floor">
                              <SelectValue placeholder="Choose the floor" />
                            </SelectTrigger>
                            <SelectContent>
                              {floorOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      <div>
                        <Label htmlFor="housing-details">Meet spot</Label>
                        <Select
                          onValueChange={setHousingDetails}
                          value={housingDetails}
                        >
                          <SelectTrigger disabled={!housingBuilding} id="housing-details">
                            <SelectValue placeholder="Choose where to meet outside" />
                          </SelectTrigger>
                          <SelectContent>
                            {meetSpotOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Meet outside since most residence halls need ID access. If you only know the quad or area, that is enough.
                        </p>
                      </div>

                      <div className="rounded-xl bg-[var(--surface-tint)] p-3 text-sm text-[var(--muted)]">
                        Final drop-off shown to couriers:{" "}
                        <span className="font-medium text-[var(--ink)]">{housingDestination || "Not selected yet"}</span>
                      </div>
                    </SectionCard>
                  ) : (
                    <SectionCard description="Type the place where you want to meet." title="3. Where should it go?">
                      {isRide ? (
                        <div className="mb-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <Label htmlFor="ride-pickup-area">Pickup region</Label>
                            <Select onValueChange={setRidePickupArea} value={ridePickupArea}>
                              <SelectTrigger id="ride-pickup-area">
                                <SelectValue placeholder="Off-campus or campus edge" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Off-campus apartment">Off-campus apartment</SelectItem>
                                <SelectItem value="Downtown Albany">Downtown Albany</SelectItem>
                                <SelectItem value="Crossgates area">Crossgates area</SelectItem>
                                <SelectItem value="Campus bus stop">Campus bus stop</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="ride-destination-area">Campus drop-off region</Label>
                            <Select onValueChange={setRideDestinationArea} value={rideDestinationArea}>
                              <SelectTrigger id="ride-destination-area">
                                <SelectValue placeholder="Choose a campus destination" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Campus Center">Campus Center</SelectItem>
                                <SelectItem value="Library">Library</SelectItem>
                                <SelectItem value="State Quad">State Quad</SelectItem>
                                <SelectItem value="Colonial Quad">Colonial Quad</SelectItem>
                                <SelectItem value="Dutch Quad">Dutch Quad</SelectItem>
                                <SelectItem value="Empire Commons">Empire Commons</SelectItem>
                                <SelectItem value="Freedom Apartments">Freedom Apartments</SelectItem>
                                <SelectItem value="Academic Podium">Academic Podium</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : null}
                      <Label htmlFor="destination">{helperCopy.destinationLabel}</Label>
                      <Input
                        id="destination"
                        onChange={(event) => setDestination(event.target.value)}
                        placeholder={
                          isRide
                            ? "Ex: Off-campus apartment -> Campus Center bus stop"
                            : helperCopy.destinationPlaceholder
                        }
                        value={destination}
                      />
                      {isRide ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          This now supports off-campus pickup into campus, which lines up with the milestone ride story.
                        </p>
                      ) : null}
                    </SectionCard>
                  )}

                </div>
              ) : null}

              <SectionCard description={isFood ? "Set the time and review the delivery charge." : "Set the time and optional tip."} title="4. Finish request">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>When do you need it?</Label>
                    <div className="mt-2 flex gap-2">
                      <Button
                        onClick={() => setTimeMode("now")}
                        size="sm"
                        type="button"
                        variant={timeMode === "now" ? "default" : "secondary"}
                      >
                        Now
                      </Button>
                      <Button
                        onClick={() => setTimeMode("schedule")}
                        size="sm"
                        type="button"
                        variant={timeMode === "schedule" ? "default" : "secondary"}
                      >
                        Schedule for later
                      </Button>
                    </div>
                    {timeMode === "schedule" ? (
                      <Input
                        className="mt-3"
                        id="time"
                        onChange={(event) => setTime(event.target.value)}
                        type="datetime-local"
                        value={time}
                      />
                    ) : (
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        Standard is now. Only pick a date and time if you want to schedule it.
                      </p>
                    )}
                  </div>

                  {isFood ? (
                    <div>
                      <Label>Delivery fee</Label>
                      <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm text-[var(--muted)]">
                            {selectedHousingArea ? `Based on ${selectedHousingArea.label}` : "Choose a delivery area first"}
                            </p>
                          </div>
                          <p className="text-2xl font-semibold text-[var(--ink)]">
                            {selectedDeliveryFee === null ? "--" : `$${formatDeliveryFee(selectedDeliveryFee)}`}
                          </p>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        This is the location-based delivery charge before any optional tip.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label>Delivery fee</Label>
                      <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-[var(--muted)]">Fixed minimum offer</p>
                          <p className="text-2xl font-semibold text-[var(--ink)]">${formatDeliveryFee(MIN_PAYMENT_OFFER)}</p>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        This is the only base price for the job. Add a tip below if you want.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label htmlFor="tip">Optional tip</Label>
                    <div className="relative">
                      <DollarSign className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                      <Input
                        className="pl-10"
                        id="tip"
                        inputMode="decimal"
                        min={0}
                        onChange={(event) => handleTipChange(event.target.value)}
                        placeholder="0"
                        step="0.50"
                        type="number"
                        value={tipAmount}
                      />
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">Tips are optional and can include cents.</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
                    <p className="text-[var(--muted)]">Total payment</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--brand-accent)]">
                      {isFood && selectedDeliveryFee === null ? "--" : `$${currentPaymentTotal}`}
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Anything else?</Label>
                  <Textarea
                    id="notes"
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder={helperCopy.notesPlaceholder}
                    rows={3}
                    value={notes}
                  />
                </div>
              </SectionCard>

              <Button className="w-full" disabled={isSubmitting || isBootstrapping} size="lg" type="submit">
                {isBootstrapping ? "Loading form..." : isSubmitting ? "Opening Stripe..." : isFood ? "Place Order And Pay" : "Place My Order"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
