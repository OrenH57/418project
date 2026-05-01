// File purpose:
// Combined login and signup screen.
// Lets students log in or sign up for the side they already chose on the landing page.

import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Phone, ImagePlus } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { getDefaultPath, setStoredView } from "../../lib/viewMode";

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

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/auth")) {
    return "";
  }

  return value;
}

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login, signup, verifyEmail } = useAuth();
  const sideParam = searchParams.get("side");
  const safeNextPath = getSafeNextPath(searchParams.get("next"));
  const initialEntryView = sideParam === "courier" || safeNextPath.startsWith("/driver-feed") ? "courier" : "requester";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationPreviewCode, setVerificationPreviewCode] = useState("");
  const [ualbanyIdImage, setUalbanyIdImage] = useState("");
  const entryView = initialEntryView;
  const [busy, setBusy] = useState(false);
  const authSubmitLockRef = useRef(false);
  const currentSideCopy = sideCopy[entryView];
  const getPostAuthPath = (nextUser: { role: string }) =>
    nextUser.role === "admin" ? "/admin" : safeNextPath || getDefaultPath(entryView);
  const hasPendingEmailVerification = Boolean(user && !user.emailVerified);

  if (user?.emailVerified) {
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
        const { user: nextUser, verification } = await login(normalizedEmail, password);
        setStoredView(entryView);
        if (verification?.required || !nextUser.emailVerified) {
          setVerificationPreviewCode(verification?.previewCode || "");
          toast.success("Enter the verification code sent to your campus email.");
          return;
        }
        toast.success("Welcome back to CampusConnect.");
        navigate(getPostAuthPath(nextUser), { replace: true });
      } else {
        if (entryView === "courier" && !ualbanyIdImage) {
          toast.error("Upload a photo of your UAlbany ID before opening the courier side.");
          return;
        }

        const { user: nextUser, verification } = await signup({
          name: normalizedName,
          email: normalizedEmail,
          phone: phone.trim(),
          password,
          role: entryView,
          ualbanyIdImage: entryView === "courier" ? ualbanyIdImage : undefined,
        });
        setStoredView(entryView);
        setVerificationPreviewCode(verification?.previewCode || "");
        toast.success("Account created. Enter the code sent to your campus email.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      authSubmitLockRef.current = false;
      setBusy(false);
    }
  }

  async function handleVerifyEmail(event?: FormEvent) {
    event?.preventDefault();
    if (authSubmitLockRef.current || !verificationCode.trim()) return;
    authSubmitLockRef.current = true;
    setBusy(true);

    try {
      const nextUser = await verifyEmail(verificationCode.trim());
      toast.success("Campus email verified.");
      navigate(getPostAuthPath(nextUser), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email verification failed.");
    } finally {
      authSubmitLockRef.current = false;
      setBusy(false);
    }
  }

  const showCourierIdUpload = mode === "signup" && entryView === "courier";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <Card className="border-[var(--border)] bg-white shadow-sm">
          {hasPendingEmailVerification ? (
            <>
              <CardHeader className="p-5 sm:p-6">
                <CardTitle>Verify your campus email</CardTitle>
                <CardDescription>
                  Enter the 6-digit code for {user?.email || email.trim().toLowerCase() || "your .edu email"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                <form className="space-y-4" onSubmit={(event) => void handleVerifyEmail(event)}>
                  <div>
                    <Label htmlFor="verification-code">Verification code</Label>
                    <Input
                      autoComplete="one-time-code"
                      id="verification-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      value={verificationCode}
                    />
                  </div>
                  {verificationPreviewCode ? (
                    <p className="text-xs text-[var(--muted)]">
                      Demo code: {verificationPreviewCode}
                    </p>
                  ) : null}
                  <Button className="w-full" disabled={busy || !verificationCode.trim()} size="lg" type="submit">
                    {busy ? "Please wait..." : "Verify Email"}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
          <>
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
          </>
          )}
        </Card>
      </div>
    </div>
  );
}
