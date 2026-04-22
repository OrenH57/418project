// File purpose:
// Request-specific chat page used after a courier accepts a job.
// Shows request details, contact info, payment actions, and the live message thread.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Phone, Shield, CreditCard, BellRing } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Input } from "../components/ui/input";
import { api, type MessageRecord, type RequestRecord } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "../components/ui/sonner";

export function Messaging() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const { token, user } = useAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [requestRecord, setRequestRecord] = useState<RequestRecord | null>(null);

  const title = useMemo(() => {
    if (!requestRecord) return `Request #${requestId ?? "unknown"}`;
    return `${requestRecord.pickup} -> ${requestRecord.destination || "Campus drop-off"}`;
  }, [requestId, requestRecord]);

  async function loadMessages() {
    if (!token || !requestId) return;

    try {
      const response = await api.getMessages(token, requestId);
      setMessages(response.messages);
      setRequestRecord(response.request);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load messages.");
    }
  }

  useEffect(() => {
    void loadMessages();
  }, [requestId, token]);

  async function handleSend() {
    if (!token || !requestId || !draft.trim()) return;

    try {
      await api.sendMessage(token, requestId, draft.trim());
      setDraft("");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message.");
    }
  }

  async function handleCheckout() {
    if (!token || !requestId) return;

    try {
      const response = await api.createCheckoutSession(token, requestId);
      window.location.href = response.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
    }
  }

  async function handleMarkFoodReady() {
    if (!token || !requestId) return;

    try {
      await api.markFoodReady(token, requestId);
      toast.success("Courier notified that the food is ready.");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the order status.");
    }
  }

  const isRequester = Boolean(user && requestRecord && user.id === requestRecord.userId);
  const canMarkFoodReady = Boolean(requestRecord?.serviceType === "food" && isRequester && !requestRecord.foodReady);

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
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{requestRecord?.requesterName?.[0] ?? "S"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-[var(--ink)]">{requestRecord?.requesterName ?? "Student partner"}</p>
                <p className="text-sm text-[var(--muted)]">
                  {requestRecord?.status === "accepted" ? "Active handoff in progress" : "Waiting for match"}
                </p>
                <p className="text-sm text-[var(--muted)]">Phone: {requestRecord?.requesterPhone || "--"}</p>
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
                    ? "The requester already told the courier the order is ready."
                    : "Use the button below as soon as you get the GET email so the courier does not wait around."}
                </p>
                {canMarkFoodReady ? (
                  <Button className="mt-3 w-full" onClick={() => void handleMarkFoodReady()} size="sm">
                    <BellRing className="mr-2 h-4 w-4" />
                    I got the ready email
                  </Button>
                ) : null}
              </div>
            ) : null}
            {requestRecord?.serviceType === "discount" ? (
              <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--ink)]">
                <p className="font-medium">Discount Dollar pricing</p>
                <p className="mt-1 text-[var(--muted)]">
                  If the student already placed the GET order, the restaurant is already paid and the app payment is just the runner fee.
                </p>
                <div className="mt-2 space-y-1 text-[var(--muted)]">
                  <p>
                    Retail total: {" "}
                    {typeof requestRecord.estimatedRetailTotal === "number"
                      ? `$${requestRecord.estimatedRetailTotal.toFixed(2)}`
                      : "--"}
                  </p>
                  <p>
                    Estimated Discount Dollar cost: {" "}
                    {typeof requestRecord.estimatedDiscountCost === "number"
                      ? `$${requestRecord.estimatedDiscountCost.toFixed(2)}`
                      : "--"}
                  </p>
                  <p>
                    Runner earnings: {" "}
                    {typeof requestRecord.runnerEarnings === "number"
                      ? `$${requestRecord.runnerEarnings.toFixed(2)}`
                      : "--"}
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
            <Button className="w-full" onClick={() => void handleCheckout()}>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay Delivery Fee
            </Button>
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
              <Button variant="outline">
                <Phone className="mr-2 h-4 w-4" />
                Call
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 p-6">
            <div className="flex-1 space-y-4 overflow-y-auto">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                      message.mine
                        ? "bg-[var(--brand-maroon)] text-white"
                        : "bg-[var(--gold-soft)] text-[var(--ink)]"
                    }`}
                  >
                    <p>{message.text}</p>
                    <p className={`mt-1 text-xs ${message.mine ? "text-white/75" : "text-[var(--muted)]"}`}>
                      {message.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <form
              className="flex gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <Input
                className="h-12"
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type your message"
                value={draft}
              />
              <Button className="h-12 px-5" type="submit">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
