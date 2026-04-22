// File purpose:
// Combined login and signup screen.
// Lets students log in or sign up, then choose which side of the app should open first.

import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Shield, UtensilsCrossed, Bike, Phone, ImagePlus, Mail } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import { toast } from "../components/ui/sonner";
import { getDefaultPath, getStoredView, setStoredView } from "../lib/viewMode";

const entryOptionCopy = {
  requester: {
    title: "Order delivery or request service",
    description: "Start on the student side for food delivery, rides, and campus services.",
  },
  courier: {
    title: "I want to deliver or use extra Discount Dollars",
    description: "Start on the courier side for jobs and restaurant pickup runs.",
  },
};

export function AuthPage() {
  const navigate = useNavigate();
  const { user, login, signup, outlookAuth } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [ualbanyIdImage, setUalbanyIdImage] = useState("");
  const [entryView, setEntryView] = useState<"requester" | "courier">(() => getStoredView());
  const [busy, setBusy] = useState(false);

  if (user) {
    const savedView = getStoredView();
    return <Navigate replace to={getDefaultPath(savedView)} />;
  }

  async function handleIdImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setUalbanyIdImage("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a photo of your UAlbany ID.");
      event.target.value = "";
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error("Keep your ID photo under 3 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUalbanyIdImage(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      toast.error("Could not read that ID image.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    try {
      setBusy(true);

      if (mode === "login") {
        await login(normalizedEmail, password);
        setStoredView(entryView);
        toast.success("Welcome back to CampusConnect.");
        navigate(getDefaultPath(entryView), { replace: true });
      } else {
        if (entryView === "courier" && !ualbanyIdImage) {
          toast.error("Upload a photo of your UAlbany ID before opening the courier side.");
          return;
        }

        await signup({
          name: normalizedName,
          email: normalizedEmail,
          phone: phone.trim(),
          password,
          role: entryView,
          ualbanyIdImage: entryView === "courier" ? ualbanyIdImage : undefined,
        });
        setStoredView(entryView);
        toast.success("Account created with your .edu email.");
        navigate(getDefaultPath(entryView), { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOutlookAuth() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    try {
      setBusy(true);

      if (!normalizedEmail) {
        toast.error("Enter your UAlbany Outlook email to continue.");
        return;
      }

      if (mode === "signup") {
        if (!normalizedName) {
          toast.error("Add your full name before continuing with Outlook.");
          return;
        }

        if (!phone.trim()) {
          toast.error("Add your phone number before continuing with Outlook.");
          return;
        }
      }

      if (entryView === "courier" && !ualbanyIdImage) {
        toast.error("Upload a photo of your UAlbany ID before opening the courier side.");
        return;
      }

      await outlookAuth({
        name: normalizedName || undefined,
        email: normalizedEmail,
        phone: phone.trim() || undefined,
        role: entryView,
        ualbanyIdImage: entryView === "courier" ? ualbanyIdImage : undefined,
      });
      setStoredView(entryView);
      toast.success(mode === "login" ? "Signed in with Outlook." : "Outlook account connected.");
      navigate(getDefaultPath(entryView), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Outlook authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-none bg-[var(--brand-maroon)] text-white shadow-xl">
          <CardContent className="p-8">
            <Badge className="mb-4 bg-white/15 text-white">UAlbany Prototype</Badge>
            <h1 className="max-w-xl text-4xl font-bold leading-tight">
              Student delivery for Campus Center restaurants that only offer pickup.
            </h1>
            <p className="mt-4 max-w-2xl text-white/85">
              CampusConnect lets students order from UAlbany Campus Center spots, post a delivery
              request, and have another student courier bring it across campus.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
                <UtensilsCrossed className="mb-3 h-5 w-5" />
                <p className="font-semibold">Campus Center pickup</p>
                <p className="mt-1 text-sm text-white/80">The Halal Shack, Starbucks, Baba&apos;s Pizza, and more.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
                <Bike className="mb-3 h-5 w-5" />
                <p className="font-semibold">Courier mode</p>
                <p className="mt-1 text-sm text-white/80">Students can switch into courier mode and accept nearby runs.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
                <Shield className="mb-3 h-5 w-5" />
                <p className="font-semibold">.edu-only access</p>
                <p className="mt-1 text-sm text-white/80">Restricting accounts to campus email improves trust and safety.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-white shadow-sm">
          <CardHeader>
            <div className="flex gap-2">
              <Button onClick={() => setMode("login")} variant={mode === "login" ? "default" : "secondary"}>
                Log In
              </Button>
              <Button onClick={() => setMode("signup")} variant={mode === "signup" ? "default" : "secondary"}>
                Sign Up
              </Button>
            </div>
            <CardTitle className="mt-4">
              {mode === "login" ? "Sign in to your campus account" : "Create your campus account"}
            </CardTitle>
            <CardDescription>
              Explore first if you want. Only sign in when you are ready to place an order or take jobs.
            </CardDescription>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => {
                  void handleOutlookAuth();
                }}
                size="lg"
                type="button"
                variant="secondary"
              >
                <Mail className="mr-2 h-4 w-4" />
                {busy
                  ? "Connecting..."
                  : mode === "login"
                    ? "Continue with UAlbany Outlook"
                    : "Sign Up with UAlbany Outlook"}
              </Button>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Prototype flow: this simulates a campus Microsoft account and keeps the app&apos;s local JSON backend.
              </p>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              <Link className="text-[var(--brand-accent)] underline-offset-4 hover:underline" to="/">
                Back to the product overview
              </Link>
            </p>
            {mode === "login" ? (
              <div className="mt-4">
                <Label>Open the app first as</Label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    className={`rounded-2xl border p-4 text-left ${
                      entryView === "requester"
                        ? "border-[var(--brand-gold)] bg-[var(--gold-soft)]"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => setEntryView("requester")}
                    type="button"
                  >
                    <p className="font-semibold text-[var(--ink)]">{entryOptionCopy.requester.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{entryOptionCopy.requester.description}</p>
                  </button>
                  <button
                    className={`rounded-2xl border p-4 text-left ${
                      entryView === "courier"
                        ? "border-[var(--brand-gold)] bg-[var(--gold-soft)]"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => setEntryView("courier")}
                    type="button"
                  >
                    <p className="font-semibold text-[var(--ink)]">{entryOptionCopy.courier.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{entryOptionCopy.courier.description}</p>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Label>Which side should open first?</Label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    className={`rounded-2xl border p-4 text-left ${
                      entryView === "requester"
                        ? "border-[var(--brand-gold)] bg-[var(--gold-soft)]"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => setEntryView("requester")}
                    type="button"
                  >
                    <p className="font-semibold text-[var(--ink)]">{entryOptionCopy.requester.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {entryOptionCopy.requester.description}
                    </p>
                  </button>
                  <button
                    className={`rounded-2xl border p-4 text-left ${
                      entryView === "courier"
                        ? "border-[var(--brand-gold)] bg-[var(--gold-soft)]"
                        : "border-[var(--border)]"
                    }`}
                    onClick={() => setEntryView("courier")}
                    type="button"
                  >
                    <p className="font-semibold text-[var(--ink)]">{entryOptionCopy.courier.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {entryOptionCopy.courier.description}
                    </p>
                  </button>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  This only chooses which side opens first. You can switch sides later.
                </p>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
            >
            {mode === "signup" ? (
              <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
                <p className="font-medium text-[var(--ink)]">Tell us about you</p>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" onChange={(event) => setName(event.target.value)} value={name} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone number</Label>
                  <div className="relative">
                    <Phone className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <Input
                      className="pl-10"
                      id="phone"
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="518-555-0123"
                      value={phone}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Couriers can use this if they need to reach you during pickup or drop-off.
                  </p>
                </div>
                {entryView === "courier" ? (
                  <div>
                    <Label htmlFor="ualbany-id">UAlbany ID photo</Label>
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-4">
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--ink)]" htmlFor="ualbany-id">
                        <ImagePlus className="h-4 w-4 text-[var(--brand-accent)]" />
                        <span>Upload a photo of your UAlbany ID to open the courier side.</span>
                      </label>
                      <Input
                        accept="image/*"
                        className="mt-3"
                        id="ualbany-id"
                        onChange={(event) => void handleIdImageChange(event)}
                        type="file"
                      />
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      This stays small and simple for the prototype, but it is required for courier access.
                    </p>
                    {ualbanyIdImage ? (
                      <img
                        alt="UAlbany ID preview"
                        className="mt-3 max-h-44 rounded-2xl border border-[var(--border)] object-cover"
                        src={ualbanyIdImage}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <Label htmlFor="email">Campus email</Label>
              <Input
                autoComplete="email"
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@albany.edu"
                value={email}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Use your UAlbany Outlook address here for either password login or the Outlook button above.
              </p>
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </div>

            <Button
              className="w-full"
              disabled={busy}
              onClick={(event) => {
                void handleSubmit(event as unknown as FormEvent);
              }}
              size="lg"
              type="submit"
            >
              {busy ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </Button>

            {mode === "login" ? (
              <div className="rounded-2xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
                <p className="font-medium text-[var(--ink)]">Demo accounts</p>
                <p className="mt-1">`ariana.green@albany.edu` / `demo123`</p>
                <p>`marcus.hall@albany.edu` / `demo123`</p>
              </div>
            ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
