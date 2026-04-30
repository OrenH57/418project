// File purpose:
// Combined login and signup screen.
// Lets students log in or sign up for the side they already chose on the landing page.

import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Shield, UtensilsCrossed, Bike, Phone, ImagePlus } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { getDefaultPath, setStoredView } from "../../lib/viewMode";
import { isMicrosoftAuthConfigured, microsoftLoginRequest } from "../../lib/microsoftAuth";

const sideCopy = {
  requester: {
    badge: "Food delivery",
    title: "Get food delivered on campus",
    description: "Sign in to request food delivery after ordering in GET, whether you are in your dorm, studying late, or working on campus.",
  },
  courier: {
    badge: "Courier side",
    title: "Become a courier",
    description: "Sign in to take nearby food delivery jobs and earn money helping students in dorms, libraries, and late-night campus spots.",
  },
};

const demoAccounts = [
  { role: "Requester", email: "ariana.green@albany.edu", password: "demo1234" },
  { role: "Courier", email: "marcus.hall@albany.edu", password: "demo1234" },
  { role: "Admin", email: "jordan.reyes@albany.edu", password: "demo1234" },
];

const baseUrl = import.meta.env.BASE_URL;

const authRestaurantImages = [
  { name: "Baba's Pizza", src: `${baseUrl}landing-food/d92086c8-f4c1-45e5-a4b9-d2f3e2fbf63c.jpeg` },
  { name: "The Corner Deli", src: `${baseUrl}landing-food/e76d7c96-352d-4692-be92-5e2a073fa442.jpeg` },
  { name: "The Spread", src: `${baseUrl}landing-food/19021f97-d322-4134-8ea8-8bc9f7f7df86.jpeg` },
  { name: "The Halal Shack", src: `${baseUrl}landing-food/5872e9d5-d87d-4c9d-914d-489c4746b7aa.jpeg` },
];

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/auth")) {
    return "";
  }

  return value;
}

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { instance } = useMsal();
  const { user, login, loginWithMicrosoft, signup } = useAuth();
  const sideParam = searchParams.get("side");
  const safeNextPath = getSafeNextPath(searchParams.get("next"));
  const initialEntryView = sideParam === "courier" || safeNextPath.startsWith("/driver-feed") ? "courier" : "requester";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [ualbanyIdImage, setUalbanyIdImage] = useState("");
  const entryView = initialEntryView;
  const [busy, setBusy] = useState(false);
  const authSubmitLockRef = useRef(false);
  const currentSideCopy = sideCopy[entryView];
  const getPostAuthPath = (nextUser: { role: string }) =>
    nextUser.role === "admin" ? "/admin" : safeNextPath || getDefaultPath(entryView);

  if (user) {
    return <Navigate replace to={getPostAuthPath(user)} />;
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
    if (authSubmitLockRef.current) return;
    authSubmitLockRef.current = true;
    setBusy(true);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    try {
      if (mode === "login") {
        const nextUser = await login(normalizedEmail, password);
        setStoredView(entryView);
        toast.success("Welcome back to CampusConnect.");
        navigate(getPostAuthPath(nextUser), { replace: true });
      } else {
        if (entryView === "courier" && !ualbanyIdImage) {
          toast.error("Upload a photo of your UAlbany ID before opening the courier side.");
          return;
        }

        const nextUser = await signup({
          name: normalizedName,
          email: normalizedEmail,
          phone: phone.trim(),
          password,
          role: entryView,
          ualbanyIdImage: entryView === "courier" ? ualbanyIdImage : undefined,
        });
        setStoredView(entryView);
        toast.success("Account created with your .edu email.");
        navigate(getPostAuthPath(nextUser), { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      authSubmitLockRef.current = false;
      setBusy(false);
    }
  }

  async function handleMicrosoftLogin() {
    if (authSubmitLockRef.current) return;
    authSubmitLockRef.current = true;
    setBusy(true);

    try {
      if (!isMicrosoftAuthConfigured) {
        throw new Error("Microsoft sign-in is not configured yet. Add the Azure client and tenant IDs in .env.local.");
      }

      if (mode === "signup" && entryView === "courier" && !ualbanyIdImage) {
        throw new Error("Upload a photo of your UAlbany ID before opening the courier side.");
      }

      const response = await instance.loginPopup(microsoftLoginRequest);
      const idToken = response.idToken;

      if (!idToken) {
        throw new Error("Microsoft sign-in finished without an ID token.");
      }

      const nextUser = await loginWithMicrosoft({
        idToken,
        role: entryView,
        phone: phone.trim() || undefined,
        ualbanyIdImage: entryView === "courier" ? ualbanyIdImage : undefined,
      });

      setStoredView(entryView);
      toast.success("Signed in with your UAlbany Microsoft account.");
      navigate(getPostAuthPath(nextUser), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Microsoft sign-in failed.");
    } finally {
      authSubmitLockRef.current = false;
      setBusy(false);
    }
  }

  const showCourierIdUpload = mode === "signup" && entryView === "courier";

  return (
    <div className="min-h-screen bg-[var(--page-bg)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto grid max-w-7xl items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,28rem)] xl:gap-8">
        <Card className="order-2 overflow-hidden border-none bg-[var(--brand-maroon)] text-white shadow-xl xl:order-1">
          <CardContent className="p-5 sm:p-8 lg:p-9">
            <Badge className="mb-3 bg-white/15 text-white sm:mb-4">UAlbany Prototype</Badge>
            <h1 className="max-w-xl text-2xl font-bold leading-tight sm:text-4xl">
              Student delivery for Campus Center food orders across campus.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-white/85 sm:mt-4 sm:text-base">
              CampusConnect is built for students who are studying, working late, or relaxing in their dorm and want food brought to them. Food orders still happen in GET first, then another student can deliver them across campus.
            </p>

            <div className="mt-5 hidden gap-3 sm:grid md:grid-cols-3 sm:gap-4 sm:mt-8">
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
                <UtensilsCrossed className="mb-3 h-5 w-5" />
                <p className="font-semibold">Campus Center pickup</p>
                <p className="mt-1 text-sm text-white/80">Order in GET first, then request delivery here for Starbucks, Baba&apos;s Pizza, and more.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
                <Bike className="mb-3 h-5 w-5" />
                <p className="font-semibold">Courier mode</p>
                <p className="mt-1 text-sm text-white/80">Couriers sign in directly to accept nearby food runs and help students across campus.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4">
                <Shield className="mb-3 h-5 w-5" />
                <p className="font-semibold">.edu-only access</p>
                <p className="mt-1 text-sm text-white/80">Restricting accounts to campus email improves trust and safety.</p>
              </div>
            </div>

            <div className="mt-4 hidden sm:block sm:mt-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(13rem,16rem)] lg:items-stretch">
                <div className="rounded-2xl border border-white/15 bg-white/8 p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/70">How CampusConnect works</p>
                  <div className="mt-4 grid gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-sm font-semibold">1</span>
                      <div>
                        <p className="font-semibold">Order food in GET</p>
                        <p className="mt-0.5 text-sm text-white/78">Students keep using the campus dining app they already know.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-sm font-semibold">2</span>
                      <div>
                        <p className="font-semibold">Post the delivery request</p>
                        <p className="mt-0.5 text-sm text-white/78">CampusConnect shares pickup, drop-off, payment, and handoff details.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/14 text-sm font-semibold">3</span>
                      <div>
                        <p className="font-semibold">Meet a verified courier</p>
                        <p className="mt-0.5 text-sm text-white/78">A UAlbany student courier brings the order across campus.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="aspect-square overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2">
                  <div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
                    {authRestaurantImages.map((image) => (
                      <div key={image.name} className="relative overflow-hidden rounded-xl bg-white/10">
                        <img alt={image.name} className="h-full w-full object-cover" src={image.src} />
                        <div className="absolute inset-x-0 bottom-0 bg-black/48 px-2 py-1 text-center text-[10px] font-medium text-white">
                          {image.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="order-1 border-[var(--border)] bg-white shadow-sm xl:order-2 xl:sticky xl:top-6">
          <CardHeader className="p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-2">
              <Button className="w-full" disabled={busy} onClick={() => setMode("login")} variant={mode === "login" ? "default" : "secondary"}>
                Log In
              </Button>
              <Button className="w-full" disabled={busy} onClick={() => setMode("signup")} variant={mode === "signup" ? "default" : "secondary"}>
                Sign Up
              </Button>
            </div>
            <CardTitle className="mt-4">
              {mode === "login" ? "Sign in to your campus account" : "Create your campus account"}
            </CardTitle>
            <CardDescription>
              {currentSideCopy.description}
            </CardDescription>
            <p className="mt-2 text-sm text-[var(--muted)]">
              <Link className="text-[var(--brand-accent)] underline-offset-4 hover:underline" to="/">
                Back to the product overview
              </Link>
            </p>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4">
              <Badge variant="secondary">{currentSideCopy.badge}</Badge>
              <p className="mt-3 font-semibold text-[var(--ink)]">{currentSideCopy.title}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{currentSideCopy.description}</p>
              <p className="mt-3 text-xs text-[var(--muted)]">
                You can still switch paths later if you need the other side.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
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
                {showCourierIdUpload ? (
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
              size="lg"
              type="submit"
            >
              {busy ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </Button>

            <Button
              className="w-full"
              disabled={busy || !isMicrosoftAuthConfigured}
              onClick={() => {
                void handleMicrosoftLogin();
              }}
              size="lg"
              type="button"
              variant="secondary"
            >
              {busy ? "Please wait..." : "Continue with UAlbany Microsoft"}
            </Button>

            {!isMicrosoftAuthConfigured ? (
              <p className="text-xs text-[var(--muted)]">
                Microsoft sign-in becomes available after `VITE_AZURE_CLIENT_ID` and `VITE_AZURE_TENANT_ID`
                are added to `.env.local`.
              </p>
            ) : null}

            <div className="rounded-2xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
              <p className="font-medium text-[var(--ink)]">Demo accounts</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                These are available in the seeded prototype database.
              </p>
              <div className="mt-3 space-y-2">
                {demoAccounts.map((account) => (
                  <div key={account.email} className="rounded-xl bg-white px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{account.role}</Badge>
                      <span className="font-medium text-[var(--ink)]">{account.email}</span>
                    </div>
                    <p className="mt-1 text-[var(--muted)]">Password: {account.password}</p>
                  </div>
                ))}
              </div>
            </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
