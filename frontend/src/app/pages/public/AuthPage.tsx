// File purpose:
// Combined login and signup screen.
// Lets students log in or sign up for the side they already chose on the landing page.

import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Phone, ImagePlus, UserRound, ShieldCheck, Store } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
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
  { role: "Requester", email: "ariana.green@albany.edu", password: "demo1234", icon: Store },
  { role: "Courier", email: "marcus.hall@albany.edu", password: "demo1234", icon: UserRound },
  { role: "Admin", email: "jordan.reyes@albany.edu", password: "demo1234", icon: ShieldCheck },
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
  const { user, login, signup, verifyEmail, resendEmailVerification, logout } = useAuth();
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

  async function handleResendVerification() {
    if (authSubmitLockRef.current) return;
    authSubmitLockRef.current = true;
    setBusy(true);

    try {
      const verification = await resendEmailVerification();
      setVerificationPreviewCode(verification.previewCode || "");
      toast.success(
        verification.delivered
          ? "A new verification code was sent to your campus email."
          : "A new demo verification code was generated.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resend the verification code.");
    } finally {
      authSubmitLockRef.current = false;
      setBusy(false);
    }
  }

  function handleCancelVerification() {
    setVerificationCode("");
    setVerificationPreviewCode("");
    logout();
    window.location.replace("/");
  }

  async function handleDemoLogin(account: (typeof demoAccounts)[number]) {
    if (authSubmitLockRef.current) return;
    authSubmitLockRef.current = true;
    setBusy(true);
    setMode("login");
    setEmail(account.email);

    try {
      const { user: nextUser, verification } = await login(account.email, account.password);
      setStoredView(account.role === "Courier" ? "courier" : "requester");
      if (verification?.required || !nextUser.emailVerified) {
        setVerificationPreviewCode(verification?.previewCode || "");
        toast.success("Enter the verification code sent to your campus email.");
        return;
      }
      toast.success(`Opening ${account.role.toLowerCase()} workspace.`);
      navigate(getPostAuthPath(nextUser), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open this workspace.");
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
                <Button className="mb-3 w-fit" onClick={handleCancelVerification} type="button" variant="link">
                  Back
                </Button>
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button disabled={busy} onClick={() => void handleResendVerification()} type="button" variant="secondary">
                      Resend Code
                    </Button>
                    <Button disabled={busy} onClick={handleCancelVerification} type="button" variant="secondary">
                      Sign Out
                    </Button>
                  </div>
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
                    Used for pickup and drop-off coordination.
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
                    <p className="mt-1 text-xs text-[var(--muted)]">Required for courier access.</p>
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

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
              <p className="font-medium text-[var(--ink)]">Explore the app</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Open a seeded role workspace.
              </p>
              <div className="mt-3 grid gap-2">
                {demoAccounts.map((account) => {
                  const Icon = account.icon;

                  return (
                    <Button
                      className="h-auto justify-start gap-3 rounded-lg bg-white px-3 py-3 text-left"
                      disabled={busy}
                      key={account.email}
                      onClick={() => void handleDemoLogin(account)}
                      type="button"
                      variant="outline"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-tint)] text-[var(--brand-maroon)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <span className="block font-medium text-[var(--ink)]">Continue as {account.role}</span>
                        <span className="block text-xs font-normal text-[var(--muted)]">{account.email}</span>
                      </div>
                    </Button>
                  );
                })}
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
