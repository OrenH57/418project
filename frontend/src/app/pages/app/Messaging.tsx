// File purpose:
// Request-specific chat page used after a courier accepts a job.
// Shows request details, contact info, payment actions, and the live message thread.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Send, Phone, Shield, CreditCard, BellRing, CheckCircle2, Clock3, XCircle, DollarSign } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, type MessageRecord, type RequestRecord } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { formatPaymentTotal, parseOptionalTip } from "../../lib/campusConfig";

export function Messaging() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [requestRecord, setRequestRecord] = useState<RequestRecord | null>(null);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [isMarkingFoodReady, setIsMarkingFoodReady] = useState(false);
  const [isCompletingRequest, setIsCompletingRequest] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const hasProcessedPaymentRedirect = useRef(false);
  const sendLockRef = useRef(false);
  const checkoutLockRef = useRef(false);
  const markFoodReadyLockRef = useRef(false);
  const completeRequestLockRef = useRef(false);
  const cancelRequestLockRef = useRef(false);

  const title = useMemo(() => {
    if (!requestRecord) return `Request #${requestId ?? "unknown"}`;
    return `${requestRecord.pickup} -> ${requestRecord.destination || "Campus drop-off"}`;
  }, [requestId, requestRecord]);

  async function loadMessages() {
    if (!token || !requestId) return;

    try {
      setIsLoadingMessages(true);
      setLoadError("");
      const response = await api.getMessages(token, requestId);
      setMessages(response.messages);
      setRequestRecord(response.request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load messages.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [requestId, token]);

  useEffect(() => {
    if (typeof requestRecord?.tipAmount === "number" && Number.isFinite(requestRecord.tipAmount)) {
      setTipAmount(requestRecord.tipAmount > 0 ? String(requestRecord.tipAmount) : "");
    }
  }, [requestRecord?.id, requestRecord?.tipAmount]);

  useEffect(() => {
    if (!token || !requestId || hasProcessedPaymentRedirect.current) return;

    const paymentState = searchParams.get("payment");
    const checkoutSessionId = searchParams.get("session_id") || undefined;
    if (paymentState !== "success" && paymentState !== "cancelled") return;

    hasProcessedPaymentRedirect.current = true;

    void (async () => {
      try {
        const response = await api.confirmCheckout(token, requestId, paymentState, checkoutSessionId);
        setRequestRecord(response.request);
        await loadMessages();
        toast.success(
          paymentState === "success" ? "Stripe payment recorded for this request." : "Stripe checkout was cancelled.",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not sync the Stripe payment result.");
      } finally {
        searchParams.delete("payment");
        setSearchParams(searchParams, { replace: true });
      }
    })();
  }, [requestId, searchParams, setSearchParams, token]);

  async function handleSend() {
    if (!token || !requestId || !draft.trim()) return;
    if (sendLockRef.current) return;
    sendLockRef.current = true;

    try {
      setIsSending(true);
      await api.sendMessage(token, requestId, draft.trim());
      setDraft("");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      sendLockRef.current = false;
      setIsSending(false);
    }
  }

  async function handleCheckout() {
    if (!token || !requestId) return;
    if (checkoutLockRef.current) return;
    const tipValidation = parseOptionalTip(tipAmount);
    if (!tipValidation.ok) {
      toast.error("Tips can use dollars and cents, up to two decimal places.");
      return;
    }
    checkoutLockRef.current = true;

    try {
      setIsCreatingCheckout(true);
      const response = await api.createCheckoutSession(token, requestId, tipValidation.amount);
      window.location.href = response.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
      checkoutLockRef.current = false;
      setIsCreatingCheckout(false);
    }
  }

  function handleTipChange(value: string) {
    if (/^\d*(\.\d{0,2})?$/.test(value)) {
      setTipAmount(value);
    }
  }

  async function handleMarkFoodReady() {
    if (!token || !requestId) return;
    if (markFoodReadyLockRef.current) return;
    markFoodReadyLockRef.current = true;

    try {
      setIsMarkingFoodReady(true);
      await api.markFoodReady(token, requestId);
      toast.success("Courier notified that the food is ready.");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the order status.");
    } finally {
      markFoodReadyLockRef.current = false;
      setIsMarkingFoodReady(false);
    }
  }

  async function handleCompleteRequest() {
    if (!token || !requestId) return;
    if (completeRequestLockRef.current) return;
    completeRequestLockRef.current = true;

    try {
      setIsCompletingRequest(true);
      await api.completeRequest(token, requestId);
      toast.success("Order marked complete.");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete this order.");
    } finally {
      completeRequestLockRef.current = false;
      setIsCompletingRequest(false);
    }
  }

  async function handleCancelRequest() {
    if (!token || !requestId) return;
    if (cancelRequestLockRef.current) return;

    const confirmed = window.confirm("Cancel this order? This will close it for everyone.");
    if (!confirmed) return;

    cancelRequestLockRef.current = true;
    try {
      setIsCancellingRequest(true);
      await api.cancelRequest(token, requestId);
      toast.success("Order cancelled.");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel this order.");
    } finally {
      cancelRequestLockRef.current = false;
      setIsCancellingRequest(false);
    }
  }

  const isRequester = Boolean(user && requestRecord && user.id === requestRecord.userId);
  const isAssignedCourier = Boolean(user && requestRecord?.acceptedBy === user.id);
  const isClosed = Boolean(
    requestRecord?.status === "completed" || requestRecord?.status === "cancelled" || requestRecord?.status === "expired",
  );
  const isActiveRequest = Boolean(requestRecord?.status === "open" || requestRecord?.status === "accepted");
  const canMarkFoodReady = Boolean(
    requestRecord?.serviceType === "food" && isRequester && isActiveRequest && !requestRecord.foodReady,
  );
  const canCompleteRequest = Boolean(requestRecord?.status === "accepted" && (isRequester || isAssignedCourier));
  const canCancelRequest = Boolean(requestRecord && isRequester && isActiveRequest);
  const courierEarnings =
    requestRecord?.serviceType === "discount" && typeof requestRecord.runnerEarnings === "number"
      ? requestRecord.runnerEarnings
      : requestRecord
        ? Number.parseFloat(requestRecord.payment)
        : null;
  const otherParticipantName = isRequester
    ? requestRecord?.courierName || "Courier not assigned yet"
    : requestRecord?.requesterName || "Customer";
  const otherParticipantRole = isRequester ? "Courier" : "Customer";
  const myRoleLabel = isRequester ? "Customer" : "Courier";
  const paymentStatus = requestRecord?.paymentStatus || "unpaid";
  const paymentLabel =
    paymentStatus === "paid" ? "Paid in Stripe" : paymentStatus === "pending" ? "Stripe checkout started" : "Not paid yet";
  const statusLabel =
    requestRecord?.status === "completed"
      ? "Completed"
      : requestRecord?.status === "cancelled"
        ? "Cancelled"
        : requestRecord?.status === "expired"
          ? "Timed out"
          : requestRecord?.status === "accepted"
            ? "Accepted"
            : "Open";

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <Button className="-ml-3 mb-2 w-fit" onClick={() => navigate(-1)} variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <CardTitle>Chat details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">You are signed in as</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--ink)]">{user?.name || "You"}</p>
                  <p className="text-sm text-[var(--muted)]">{user?.phone || "--"}</p>
                </div>
                <Badge variant="secondary">{myRoleLabel}</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
              <Avatar>
                <AvatarFallback>{otherParticipantName[0] ?? "S"}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[var(--ink)]">{otherParticipantName}</p>
                  <Badge variant="outline">{otherParticipantRole}</Badge>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {requestRecord?.status === "accepted"
                    ? "Active handoff in progress"
                    : isClosed
                      ? "This order is closed"
                      : "Waiting for match"}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Phone: {isRequester ? "--" : requestRecord?.requesterPhone || "--"}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
              <div className="mb-2 flex items-center gap-2 font-medium text-[var(--ink)]">
                <Shield className="h-4 w-4 text-green-700" />
                Safety reminder
              </div>
              Meet in public campus spaces, confirm the pickup name, and keep communication in-app.
            </div>

            {requestRecord?.orderEta ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--gold-soft)] p-4 text-sm text-[var(--ink)]">
                <p className="font-medium">GET Mobile ready estimate</p>
                <p className="mt-1">{requestRecord.orderEta}</p>
              </div>
            ) : null}

            {requestRecord?.serviceType === "food" ? (
              <div
                className={`rounded-xl border p-4 text-sm ${
                  requestRecord.foodReady
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-[var(--border)] bg-white text-[var(--ink)]"
                }`}
              >
                <p className="font-medium">
                  {requestRecord.foodReady ? "Food is ready for pickup" : "Waiting for the GET ready email"}
                </p>
                <p className="mt-1 text-[var(--muted)]">
                  {requestRecord.foodReady
                    ? "The customer already told the courier the order is ready."
                    : "Use the button below as soon as you get the GET email so the courier does not wait around."}
                </p>
                {canMarkFoodReady ? (
                  <Button
                    className="mt-3 w-full"
                    disabled={isMarkingFoodReady}
                    onClick={() => void handleMarkFoodReady()}
                    size="sm"
                  >
                    <BellRing className="mr-2 h-4 w-4" />
                    {isMarkingFoodReady ? "Notifying courier..." : "I got the ready email"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {requestRecord ? (
              <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--ink)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Order status</p>
                    <p className="mt-1 text-[var(--muted)]">
                      {requestRecord.status === "completed"
                        ? "This order is complete and no longer appears as an active job."
                        : requestRecord.status === "cancelled"
                          ? "The requester cancelled this order."
                          : requestRecord.status === "expired"
                            ? "This order timed out before a courier accepted it."
                            : requestRecord.status === "accepted"
                              ? "Complete the order after the handoff is done."
                              : "Cancel if you no longer need this order fulfilled."}
                    </p>
                  </div>
                  <Badge variant={isClosed ? "secondary" : "outline"}>{statusLabel}</Badge>
                </div>
                {canCompleteRequest || canCancelRequest ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {canCompleteRequest ? (
                      <Button
                        className="w-full"
                        disabled={isCompletingRequest || isCancellingRequest}
                        onClick={() => void handleCompleteRequest()}
                        size="sm"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {isCompletingRequest ? "Completing..." : "Mark Complete"}
                      </Button>
                    ) : null}
                    {canCancelRequest ? (
                      <Button
                        className="w-full"
                        disabled={isCancellingRequest || isCompletingRequest}
                        onClick={() => void handleCancelRequest()}
                        size="sm"
                        variant="outline"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        {isCancellingRequest ? "Cancelling..." : "Cancel Order"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {requestRecord?.serviceType === "discount" ? (
              <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--ink)]">
                <p className="font-medium">Discount Dollars preview</p>
                <p className="mt-1 text-[var(--muted)]">
                  This reflects an older Discount Dollars request. New Discount Dollars posting is being reworked and is currently shown as coming soon in the app.
                </p>
                <div className="mt-2 space-y-1 text-[var(--muted)]">
                  <p>
                    Retail total:{" "}
                    {typeof requestRecord.estimatedRetailTotal === "number"
                      ? `$${requestRecord.estimatedRetailTotal.toFixed(2)}`
                      : "--"}
                  </p>
                  <p>
                    Estimated Discount Dollar cost:{" "}
                    {typeof requestRecord.estimatedDiscountCost === "number"
                      ? `$${requestRecord.estimatedDiscountCost.toFixed(2)}`
                      : "--"}
                  </p>
                  <p>
                    Runner earnings:{" "}
                    {typeof requestRecord.runnerEarnings === "number" ? `$${requestRecord.runnerEarnings.toFixed(2)}` : "--"}
                  </p>
                </div>
              </div>
            ) : null}

            {requestRecord?.orderScreenshot ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--ink)]">Order screenshot</p>
                <img
                  alt="Uploaded order screenshot"
                  className="rounded-2xl border border-[var(--border)]"
                  src={requestRecord.orderScreenshot}
                />
              </div>
            ) : null}

            <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--ink)]">
              <p className="font-medium">{isRequester ? "Delivery fee" : "Courier earnings"}</p>
              <p className="mt-1 text-[var(--muted)]">
                {isRequester
                  ? "This is the amount tied to the request on the customer side."
                  : "This is what you will earn for completing the job."}
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--brand-accent)]">
                {courierEarnings !== null && Number.isFinite(courierEarnings) ? `$${courierEarnings.toFixed(2)}` : "--"}
              </p>
              {isRequester ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                  {paymentStatus === "paid" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock3 className="h-3.5 w-3.5 text-amber-600" />}
                  {paymentLabel}
                </div>
              ) : null}
            </div>

            {isRequester && isActiveRequest && requestRecord?.serviceType !== "food" ? (
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
                <div>
                  <Label htmlFor="chat-tip">Optional tip</Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <Input
                      className="pl-10"
                      disabled={paymentStatus === "paid" || paymentStatus === "pending" || isCreatingCheckout}
                      id="chat-tip"
                      inputMode="decimal"
                      min={0}
                      onChange={(event) => handleTipChange(event.target.value)}
                      placeholder="0"
                      step="0.50"
                      type="number"
                      value={tipAmount}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Tips can include cents. Total at checkout: $
                    {requestRecord
                      ? formatPaymentTotal(
                          typeof requestRecord.basePayment === "number"
                            ? requestRecord.basePayment
                            : Number.parseFloat(requestRecord.payment || "0") - (requestRecord.tipAmount || 0),
                          parseOptionalTip(tipAmount).ok ? parseOptionalTip(tipAmount).amount : 0,
                        )
                      : "--"}
                  </p>
                </div>
                <Button
                  className="w-full"
                  disabled={paymentStatus === "paid" || isCreatingCheckout}
                  onClick={() => void handleCheckout()}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {paymentStatus === "paid" ? "Delivery Fee Paid" : isCreatingCheckout ? "Opening Stripe..." : "Pay Delivery Fee"}
                </Button>
              </div>
            ) : null}

            <Button className="w-full" onClick={() => navigate(`/rate/${requestId ?? "1"}`)} variant="secondary">
              Leave Rating
            </Button>
          </CardContent>
        </Card>

        <Card className="flex min-h-[560px] flex-col">
          <CardHeader className="border-b border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-semibold text-[var(--ink)]">{title}</h1>
                <p className="text-sm text-[var(--muted)]">Coordinate pickup, delivery, and ETA updates.</p>
              </div>
              <Button disabled variant="outline">
                <Phone className="mr-2 h-4 w-4" />
                Call Soon
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 p-6">
            <div className="flex-1 space-y-4 overflow-y-auto">
              {loadError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
                  {loadError}
                </div>
              ) : null}

              {isLoadingMessages ? (
                <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-6 text-center text-sm text-[var(--muted)]">
                  Loading conversation...
                </div>
              ) : null}

              {!isLoadingMessages && !loadError && messages.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-6 text-center text-sm text-[var(--muted)]">
                  No messages yet. Send the first update to coordinate the handoff.
                </div>
              ) : null}

              {!isLoadingMessages && !loadError ? messages.map((message) => (
                <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                      message.mine ? "bg-[var(--brand-maroon)] text-white" : "bg-[var(--gold-soft)] text-[var(--ink)]"
                    }`}
                  >
                    <p className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${message.mine ? "text-white/75" : "text-[var(--muted)]"}`}>
                      {message.mine ? `You - ${myRoleLabel}` : `${message.senderName} - ${otherParticipantRole}`}
                    </p>
                    <p>{message.text}</p>
                    <p className={`mt-1 text-xs ${message.mine ? "text-white/75" : "text-[var(--muted)]"}`}>
                      {message.time}
                    </p>
                  </div>
                </div>
              )) : null}
            </div>

            <form
              className="flex gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <Input
                aria-label="Message input"
                className="h-12"
                disabled={Boolean(loadError) || isSending}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type your message"
                value={draft}
              />
              <Button className="h-12 px-5" disabled={!draft.trim() || Boolean(loadError) || isSending} type="submit">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
