// File purpose:
// Request-specific page for chat, payment, readiness, and completion.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  RefreshCw,
  Send,
  Shield,
  XCircle,
} from "lucide-react";
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

const requesterQuickReplies = ["I got the ready email", "I'm outside", "Payment is done", "Thanks!"];
const courierQuickReplies = ["On my way", "At Campus Center", "Food picked up", "I'm outside", "Delivered"];

function getStatusLabel(status?: string) {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Timed out";
  if (status === "accepted") return "Accepted";
  return "Open";
}

function getPaymentLabel(paymentStatus: RequestRecord["paymentStatus"] | undefined) {
  if (paymentStatus === "paid") return "Paid";
  if (paymentStatus === "pending") return "Checkout started";
  return "Payment needed";
}

function isSystemMessage(message: MessageRecord) {
  return [
    "accepted this request",
    "Request posted successfully",
    "Food delivery request posted",
    "Stripe Checkout",
    "Payment was completed",
    "Order completed",
    "cancelled this order",
  ].some((snippet) => message.text.includes(snippet));
}

export function Messaging() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [requestRecord, setRequestRecord] = useState<RequestRecord | null>(null);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [isSyncingPayment, setIsSyncingPayment] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [isMarkingFoodReady, setIsMarkingFoodReady] = useState(false);
  const [isCompletingRequest, setIsCompletingRequest] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const hasProcessedPaymentRedirect = useRef(false);
  const sendLockRef = useRef(false);
  const checkoutLockRef = useRef(false);
  const paymentSyncLockRef = useRef(false);
  const messageRefreshLockRef = useRef(false);
  const markFoodReadyLockRef = useRef(false);
  const completeRequestLockRef = useRef(false);
  const cancelRequestLockRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const title = useMemo(() => {
    if (!requestRecord) return `Request #${requestId ?? "unknown"}`;
    return `${requestRecord.pickup} -> ${requestRecord.destination || "Campus drop-off"}`;
  }, [requestId, requestRecord]);
  const shouldPollMessages = Boolean(requestRecord?.status === "open" || requestRecord?.status === "accepted");

  const loadMessages = useCallback(async ({ silent = false } = {}) => {
    if (!token || !requestId) return;
    if (messageRefreshLockRef.current) return;
    messageRefreshLockRef.current = true;

    try {
      if (!silent) {
        setIsLoadingMessages(true);
      } else {
        setIsRefreshingMessages(true);
      }
      const response = await api.getMessages(token, requestId);
      setMessages(response.messages);
      setRequestRecord(response.request);
      setLoadError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load messages.";
      if (!silent) {
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      messageRefreshLockRef.current = false;
      if (!silent) {
        setIsLoadingMessages(false);
      } else {
        setIsRefreshingMessages(false);
      }
    }
  }, [requestId, token]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!token || !requestId || !shouldPollMessages) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadMessages({ silent: true });
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadMessages, requestId, shouldPollMessages, token]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, isLoadingMessages]);

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
      let shouldClearPaymentParams = paymentState === "cancelled";
      try {
        if (paymentState === "success") {
          let lastError: unknown;
          for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
              const response = await api.confirmCheckout(token, requestId, paymentState, checkoutSessionId);
              setRequestRecord(response.request);
              await loadMessages();
              shouldClearPaymentParams = true;
              lastError = undefined;
              break;
            } catch (error) {
              lastError = error;
              await new Promise((resolve) => window.setTimeout(resolve, 900));
            }
          }

          if (lastError) throw lastError;
        } else {
          const response = await api.confirmCheckout(token, requestId, paymentState, checkoutSessionId);
          setRequestRecord(response.request);
          await loadMessages();
        }
        toast.success(
          paymentState === "success" ? "Stripe payment recorded for this request." : "Stripe checkout was cancelled.",
        );
      } catch (error) {
        hasProcessedPaymentRedirect.current = false;
        toast.error(
          error instanceof Error
            ? `${error.message} Use Sync payment to check again.`
            : "Could not sync the Stripe payment result. Use Sync payment to check again.",
        );
      } finally {
        if (!shouldClearPaymentParams) return;
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete("payment");
        nextSearchParams.delete("session_id");
        setSearchParams(nextSearchParams, { replace: true });
      }
    })();
  }, [requestId, searchParams, setSearchParams, token]);

  async function sendMessageText(text: string) {
    if (!token || !requestId || !text.trim()) return;
    if (sendLockRef.current) return;
    sendLockRef.current = true;

    try {
      setIsSending(true);
      await api.sendMessage(token, requestId, text.trim());
      setDraft("");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      sendLockRef.current = false;
      setIsSending(false);
    }
  }

  async function handleSyncPayment() {
    if (!token || !requestId) return;
    if (paymentSyncLockRef.current) return;
    paymentSyncLockRef.current = true;

    try {
      setIsSyncingPayment(true);
      const response = await api.confirmCheckout(token, requestId, "success");
      setRequestRecord(response.request);
      await loadMessages();
      toast.success("Stripe payment synced.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stripe has not marked this checkout paid yet.");
    } finally {
      paymentSyncLockRef.current = false;
      setIsSyncingPayment(false);
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
      const response = await api.completeRequest(token, requestId);
      setRequestRecord(response.request);
      toast.success(response.request.status === "completed" ? "Order completed." : "Handoff update recorded.");
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
  const paymentStatus = requestRecord?.paymentStatus || "unpaid";
  const completionBlocker =
    paymentStatus !== "paid"
      ? paymentStatus === "pending"
        ? "Stripe checkout is still pending."
        : "Payment must be completed before this request can be closed."
      : "";
  const foodReadyNote =
    requestRecord?.serviceType === "food" && !requestRecord.foodReady && requestRecord.status === "accepted"
      ? "Food has not been marked ready yet. Confirm the GET ready email before pickup."
      : "";
  const courierMarkedDelivered = Boolean(requestRecord?.deliveryConfirmedByCourier);
  const requesterConfirmedReceived = Boolean(requestRecord?.receivedConfirmedByRequester);
  const canCourierConfirmDelivery = Boolean(isAssignedCourier && !courierMarkedDelivered);
  const canRequesterConfirmReceipt = Boolean(isRequester && courierMarkedDelivered && !requesterConfirmedReceived);
  const canUpdateHandoff = Boolean(
    requestRecord?.status === "accepted" && !completionBlocker && (canCourierConfirmDelivery || canRequesterConfirmReceipt),
  );
  const completionButtonLabel = isCompletingRequest
    ? isAssignedCourier
      ? "Marking Delivered..."
      : "Confirming..."
    : isAssignedCourier
      ? courierMarkedDelivered
        ? "Delivered, Waiting"
        : "Mark Delivered"
      : !courierMarkedDelivered
        ? "Waiting For Courier"
        : requesterConfirmedReceived
          ? "Received, Waiting"
          : "Confirm Received";
  const handoffStatusNote =
    requestRecord?.status === "accepted" && !completionBlocker
      ? courierMarkedDelivered && !requesterConfirmedReceived
        ? "Courier marked delivered. The requester needs to confirm receipt before this closes."
        : requesterConfirmedReceived && !courierMarkedDelivered
          ? "Requester confirmed receipt. Waiting for the courier to mark delivered."
          : ""
      : "";
  const canCancelRequest = Boolean(requestRecord && isRequester && isActiveRequest);
  const canRateRequest = Boolean(requestRecord?.status === "completed");
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
  const quickReplies = isRequester ? requesterQuickReplies : courierQuickReplies;
  const statusLabel = getStatusLabel(requestRecord?.status);
  const paymentLabel = getPaymentLabel(paymentStatus);
  const paymentTone =
    paymentStatus === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : paymentStatus === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-rose-200 bg-rose-50 text-rose-900";

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-4">
          <Button className="-ml-3 w-fit" onClick={() => navigate(-1)} variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-[var(--border)] bg-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant={isClosed ? "secondary" : "outline"}>{statusLabel}</Badge>
                    <Badge className={paymentTone} variant="outline">{paymentLabel}</Badge>
                    {requestRecord?.serviceType === "food" ? (
                      <Badge className={requestRecord.foodReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : ""} variant="outline">
                        {requestRecord.foodReady ? "Food ready" : "Waiting for GET ready"}
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-xl text-[var(--ink)]">{title}</CardTitle>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Coordinate pickup, delivery, payment, and handoff updates here.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className="gap-1" variant={shouldPollMessages ? "secondary" : "outline"}>
                    <span className={`h-2 w-2 rounded-full ${shouldPollMessages ? "bg-emerald-600" : "bg-[var(--muted)]"}`} />
                    {isRefreshingMessages ? "Updating..." : shouldPollMessages ? "Live" : "Paused"}
                  </Badge>
                  <Button
                    disabled={isRefreshingMessages || isLoadingMessages}
                    onClick={() => void loadMessages({ silent: true })}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshingMessages ? "animate-spin" : ""}`} />
                  </Button>
                  <Button onClick={() => setShowDetails((current) => !current)} size="sm" variant="outline">
                    {showDetails ? "Hide Details" : "Show Details"}
                  </Button>
                  {canRateRequest ? (
                    <Button onClick={() => navigate(`/rate/${requestId ?? "1"}`)} size="sm" variant="secondary">
                      Leave Rating
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex min-h-[600px] flex-col gap-4 p-4 sm:p-6">
              <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-[var(--surface-tint)] p-3 sm:p-4">
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
                    No messages yet. Send an ETA or pickup update to start the handoff.
                  </div>
                ) : null}

                {!isLoadingMessages && !loadError ? messages.map((message) => {
                  const systemMessage = isSystemMessage(message);
                  if (systemMessage) {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="max-w-[88%] rounded-full border border-[var(--border)] bg-white px-4 py-2 text-center text-xs text-[var(--muted)] shadow-sm">
                          {message.text}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          message.mine ? "bg-[var(--brand-maroon)] text-white" : "bg-white text-[var(--ink)]"
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
                  );
                }) : null}
                <div ref={messageEndRef} />
              </div>

              {isActiveRequest ? (
                <div className="flex flex-wrap gap-2">
                  {quickReplies.map((reply) => (
                    <Button
                      disabled={isSending || Boolean(loadError)}
                      key={reply}
                      onClick={() => void sendMessageText(reply)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {reply}
                    </Button>
                  ))}
                </div>
              ) : null}

              <form
                className="flex gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessageText(draft);
                }}
              >
                <Input
                  aria-label="Message input"
                  className="h-12"
                  disabled={Boolean(loadError) || isSending || isClosed}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={isClosed ? "This request is closed" : "Type your message"}
                  value={draft}
                />
                <Button className="h-12 px-5" disabled={!draft.trim() || Boolean(loadError) || isSending || isClosed} type="submit">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        {showDetails ? (
          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Handoff Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-3">
                  <Avatar>
                    <AvatarFallback>{otherParticipantName[0] ?? "S"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ink)]">{otherParticipantName}</p>
                    <p className="text-sm text-[var(--muted)]">{otherParticipantRole}</p>
                    {!isRequester && requestRecord?.requesterPhone ? (
                      <p className="text-sm text-[var(--muted)]">{requestRecord.requesterPhone}</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm">
                  <p className="font-medium text-[var(--ink)]">{isRequester ? "Delivery fee" : "Courier earnings"}</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--brand-accent)]">
                    {courierEarnings !== null && Number.isFinite(courierEarnings) ? `$${courierEarnings.toFixed(2)}` : "--"}
                  </p>
                  <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${paymentTone}`}>
                    {paymentStatus === "paid" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                    {paymentLabel}
                  </div>
                </div>

                {requestRecord?.serviceType === "food" ? (
                  <div className={`rounded-xl border p-3 text-sm ${
                    requestRecord.foodReady
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                  >
                    <p className="font-medium">
                      {requestRecord.foodReady ? "Food is ready for pickup" : "Waiting for the GET ready email"}
                    </p>
                    <p className="mt-1">
                      {requestRecord.foodReady
                        ? "The requester has told the courier the order is ready."
                        : "Mark ready when the GET email arrives so the courier does not wait around."}
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

                {completionBlocker || foodReadyNote || handoffStatusNote ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    {completionBlocker ? <p>{completionBlocker}</p> : null}
                    {foodReadyNote ? <p className={completionBlocker ? "mt-2" : ""}>{foodReadyNote}</p> : null}
                    {handoffStatusNote ? <p className={completionBlocker || foodReadyNote ? "mt-2" : ""}>{handoffStatusNote}</p> : null}
                  </div>
                ) : null}

                {requestRecord ? (
                  <div className="grid gap-2">
                    {requestRecord.status === "accepted" && (isRequester || isAssignedCourier) ? (
                      <Button
                        className="w-full"
                        disabled={!canUpdateHandoff || isCompletingRequest || isCancellingRequest}
                        onClick={() => void handleCompleteRequest()}
                        size="sm"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {completionButtonLabel}
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
              </CardContent>
            </Card>

            {isRequester && isActiveRequest ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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
                      Total at checkout: $
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
                    disabled={paymentStatus === "paid" || paymentStatus === "pending" || isCreatingCheckout || isSyncingPayment}
                    onClick={() => void handleCheckout()}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {paymentStatus === "paid"
                      ? "Delivery Fee Paid"
                      : paymentStatus === "pending"
                        ? "Checkout Pending"
                        : isCreatingCheckout
                          ? "Opening Stripe..."
                          : "Pay Delivery Fee"}
                  </Button>
                  {paymentStatus === "pending" ? (
                    <Button
                      className="w-full"
                      disabled={isSyncingPayment}
                      onClick={() => void handleSyncPayment()}
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingPayment ? "animate-spin" : ""}`} />
                      {isSyncingPayment ? "Checking Stripe..." : "Sync Payment"}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="space-y-3 p-4 text-sm text-[var(--muted)]">
                <div className="flex items-center gap-2 font-medium text-[var(--ink)]">
                  <Shield className="h-4 w-4 text-green-700" />
                  Safety reminder
                </div>
                <p>Meet in public campus spaces, confirm the pickup name, and keep communication in this chat.</p>
              </CardContent>
            </Card>

            {requestRecord?.orderEta ? (
              <Card>
                <CardContent className="p-4 text-sm">
                  <p className="font-medium text-[var(--ink)]">GET ready estimate</p>
                  <p className="mt-1 text-[var(--muted)]">{requestRecord.orderEta}</p>
                </CardContent>
              </Card>
            ) : null}

            {requestRecord?.orderScreenshot ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Screenshot</CardTitle>
                </CardHeader>
                <CardContent>
                  <img
                    alt="Uploaded order screenshot"
                    className="max-h-64 w-full rounded-xl border border-[var(--border)] object-cover"
                    src={requestRecord.orderScreenshot}
                  />
                </CardContent>
              </Card>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
