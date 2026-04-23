// File purpose:
// Main request creation form for food delivery and rides.
// Builds the final request payload and validates the pieces students enter.

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, DollarSign, ImagePlus } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "../components/ui/sonner";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  MIN_PAYMENT_OFFER,
  serviceTypes,
  housingLocations,
  getHelperCopy,
  buildFoodNotes,
  buildHousingDestination,
  getFloorOptions,
  getMeetSpotOptions,
} from "../lib/campusConfig";
import { openGetMobile } from "../lib/getMobile";

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

  const [serviceType, setServiceType] = useState(typeFromUrl);
  const [pickup, setPickup] = useState(pickupFromUrl);
  const [destination, setDestination] = useState("");
  const [timeMode, setTimeMode] = useState<"now" | "schedule">("now");
  const [time, setTime] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const paymentAmount = Number.parseFloat(payment);
  const isFood = serviceType === "food";
  const isHousingDelivery = isFood;
  const hasOrderScreenshot = Boolean(orderScreenshot);
  const [hasOrderedInGet, setHasOrderedInGet] = useState(!isFood);

  useEffect(() => {
    setHasOrderedInGet(!isFood);
  }, [isFood]);

  useEffect(() => {
    async function loadBootstrap() {
      if (!token) return;

      const response = await api.bootstrap(token);
      setRestaurants(response.restaurants);

      if (!pickupFromUrl && response.restaurants[0] && isFood) {
        setPickup(response.restaurants[0]);
      }
    }

    void loadBootstrap();
  }, [isFood, pickupFromUrl, token]);

  useEffect(() => {
    if (serviceType !== "food" && serviceType !== "ride") {
      return;
    }

    if (!housingDestination) {
      return;
    }

    setDestination(housingDestination);
  }, [housingDestination, serviceType]);

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

    const finalTime = timeMode === "now" ? "Now" : time.trim();

    if (!serviceType || !pickup || !payment || (needsDestination && !destination)) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (timeMode === "schedule" && !finalTime) {
      toast.error("Choose the date and time if you want to schedule this for later.");
      return;
    }

    if (serviceType === "food" && !hasOrderScreenshot && (!orderNumber.trim() || !orderItems.trim())) {
      toast.error("Add the GET Mobile order number and item summary, or upload the GET confirmation screenshot.");
      return;
    }

    if (serviceType === "food" && !housingArea) {
      toast.error("Choose the residential area for delivery.");
      return;
    }

    if (!Number.isFinite(paymentAmount) || paymentAmount < MIN_PAYMENT_OFFER) {
      toast.error(`Payment offers must be at least $${MIN_PAYMENT_OFFER}.`);
      return;
    }

    const requestNotes =
      serviceType === "food"
        ? hasOrderScreenshot
          ? [notes.trim() ? `Extra notes: ${notes.trim()}` : "", "GET order screenshot uploaded."]
              .filter(Boolean)
              .join("\n")
          : buildFoodNotes(orderNumber, orderItems, notes)
        : notes.trim();

    try {
      setIsSubmitting(true);
      const response = await api.createRequest(token, {
        serviceType,
        pickup,
        destination,
        time: finalTime,
        payment,
        notes: requestNotes,
        orderEta: orderEta.trim(),
        orderScreenshot,
        estimatedRetailTotal: Number.isFinite(estimatedRetailAmount) ? estimatedRetailAmount : undefined,
        startCheckout: serviceType === "food",
      });

      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
        return;
      }

      toast.success("Order placed successfully!");
      window.setTimeout(() => navigate(`/messages/${response.request.id}`), 700);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post request.");
    } finally {
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
                  description="First order in GET, then come back here to request delivery."
                  title="2. Order details"
                >
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
                    <p className="font-medium text-[var(--ink)]">Simple food flow</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      1. Open GET. 2. Place the order. 3. Take a screenshot of the confirmation. 4. Come back here and finish the delivery request.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          openGetMobile();
                          setHasOrderedInGet(true);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Open GET First
                      </Button>
                      <Button onClick={() => setHasOrderedInGet(true)} size="sm" variant="outline">
                        I Already Ordered
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      GET opens in a new tab so this page stays here. The screenshot is the easiest way to show the courier what to pick up.
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
                            <SelectTrigger id="pickup">
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
                    <Input id="pickup" onChange={(event) => setPickup(event.target.value)} value={pickup} />
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
                      <Label htmlFor="destination">{helperCopy.destinationLabel}</Label>
                      <Input
                        id="destination"
                        onChange={(event) => setDestination(event.target.value)}
                        placeholder={helperCopy.destinationPlaceholder}
                        value={destination}
                      />
                    </SectionCard>
                  )}

                </div>
              ) : null}

              <SectionCard description="Set the time and what you will pay." title="4. Finish request">
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

                  <div>
                    <Label htmlFor="payment">Delivery fee you will pay *</Label>
                    <div className="relative">
                      <DollarSign className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                      <Input
                        className="pl-10"
                        id="payment"
                        min={MIN_PAYMENT_OFFER}
                        onChange={(event) => setPayment(event.target.value)}
                        placeholder="Minimum $4"
                        step="1"
                        type="number"
                        value={payment}
                      />
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      This is what the courier earns for the job. Minimum offer: $4.
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

              <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                {isSubmitting ? "Opening Stripe..." : isFood ? "Place Order And Pay" : "Place My Order"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
