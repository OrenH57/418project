// File purpose:
// Student profile page for bio, courier mode, stats, and food-safety verification.
// This is where courier verification is requested and confirmed.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ChangeEvent } from "react";
import { ArrowLeft, ShieldCheck, Star, Wallet, Bell, Footprints, MailCheck, ImagePlus, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/ui/sonner";
import { getDefaultPath, getStoredView } from "../../lib/viewMode";
import { browserNotificationsSupported, requestBrowserNotificationPermission } from "../../lib/notifications";

type ProfileData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "requester" | "courier" | "admin";
  courierMode: boolean;
  ualbanyIdUploaded: boolean;
  ualbanyIdImage?: string;
  foodSafetyVerified: boolean;
  notificationsEnabled: boolean;
  courierOnline: boolean;
  bio: string;
  rating: number;
  completedJobs: number;
  earnings: number;
  postedRequests: number;
  acceptedRequests: number;
};

type ProfileUpdateInput = Parameters<typeof api.updateProfile>[1];

function isPreviewableImage(value = "") {
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value.trim());
}

export function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, user, updateLocalUser } = useAuth();
  const preferredView = getStoredView();
  const setupCourier = searchParams.get("setup") === "courier";
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [bio, setBio] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [ualbanyIdImage, setUalbanyIdImage] = useState("");

  function buildProfileUpdateInput(
    nextProfile: Pick<ProfileData, "courierMode" | "notificationsEnabled" | "courierOnline">,
    nextBio = bio,
  ): ProfileUpdateInput {
    return {
      courierMode: nextProfile.courierMode,
      bio: nextBio,
      ...(isPreviewableImage(ualbanyIdImage) ? { ualbanyIdImage } : {}),
      notificationsEnabled: nextProfile.notificationsEnabled,
      courierOnline: nextProfile.courierOnline,
    };
  }

  useEffect(() => {
    async function loadProfile() {
      if (!token) return;

      try {
        const response = await api.getProfile(token);
        setProfile(response.profile);
        setBio(response.profile.bio);
        setUalbanyIdImage(response.profile.ualbanyIdImage || "");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load profile.");
      }
    }

    void loadProfile();
  }, [token]);

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
    reader.onload = async () => {
      const nextImage = typeof reader.result === "string" ? reader.result : "";
      setUalbanyIdImage(nextImage);

      setProfile((current) =>
        current
          ? {
              ...current,
              ualbanyIdUploaded: true,
              ualbanyIdImage: nextImage,
            }
          : current,
      );
      if (user && nextImage) {
        updateLocalUser({
          ...user,
          ualbanyIdUploaded: true,
          ualbanyIdImage: nextImage,
        });
      }

      if (!token || !profile || !nextImage) {
        return;
      }

      try {
        const response = await api.updateProfile(token, {
          ...buildProfileUpdateInput(profile),
          ualbanyIdImage: nextImage,
        });

        setProfile((current) =>
          current
            ? {
                ...current,
                ualbanyIdUploaded: response.user.ualbanyIdUploaded,
                ualbanyIdImage: response.user.ualbanyIdImage,
              }
            : current,
        );
        updateLocalUser(response.user);
        toast.success("UAlbany ID uploaded.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that ID image.");
      }
    };
    reader.onerror = () => {
      toast.error("Could not read that ID image.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  async function saveBio() {
    if (!token || !profile) return;

    try {
      const response = await api.updateProfile(token, {
        ...buildProfileUpdateInput(profile),
      });
      setProfile((current) =>
        current
          ? {
              ...current,
              bio: response.user.bio,
              ualbanyIdUploaded: response.user.ualbanyIdUploaded,
              ualbanyIdImage: response.user.ualbanyIdImage,
              notificationsEnabled: response.user.notificationsEnabled,
              courierOnline: response.user.courierOnline,
            }
          : current,
      );
      updateLocalUser(response.user);
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile.");
    }
  }

  async function requestVerificationCode() {
    if (!token) return;

    try {
      const response = await api.requestCourierVerificationCode(token);
      toast.success(`Verification code sent to your campus email. Demo code: ${response.previewCode}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send verification code.");
    }
  }

  async function verifyCourierEmail() {
    if (!token || !profile || !verificationCode.trim()) return;

    try {
      const response = await api.verifyCourierCode(token, verificationCode.trim());
      setProfile((current) =>
        current
          ? {
              ...current,
              foodSafetyVerified: response.user.foodSafetyVerified,
            }
          : current,
      );
      updateLocalUser(response.user);
      setVerificationCode("");
      toast.success("Courier food safety verification completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify code.");
    }
  }

  async function updatePreferences(nextValues: Partial<Pick<ProfileData, "notificationsEnabled" | "courierOnline">>) {
    if (!token || !profile) return;

    const nextProfile = { ...profile, ...nextValues };

    try {
      const response = await api.updateProfile(token, {
        ...buildProfileUpdateInput(nextProfile),
      });
      setProfile((current) => (current ? { ...current, ...nextValues } : current));
      updateLocalUser(response.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update preferences.");
    }
  }

  async function handleNotificationToggle() {
    if (!profile) return;

    if (!profile.notificationsEnabled) {
      const permission = await requestBrowserNotificationPermission();
      if (permission === "denied" || permission === "unsupported") {
        toast.error("Browser notifications are not available on this device yet.");
        return;
      }
    }

    const nextEnabled = !profile.notificationsEnabled;
    await updatePreferences({ notificationsEnabled: nextEnabled });
    toast.success(nextEnabled ? "Notifications turned on." : "Notifications turned off.");
  }

  async function handleCourierOnlineToggle() {
    if (!profile) return;

    if (!profile.notificationsEnabled) {
      const permission = await requestBrowserNotificationPermission();
      if (permission === "granted") {
        await updatePreferences({ notificationsEnabled: true });
      } else if (permission === "denied" || permission === "unsupported") {
        toast.success("Courier mode can still go online without browser notifications on this device.");
      }
    }

    const nextOnline = !profile.courierOnline;
    await updatePreferences({ courierOnline: nextOnline });
    toast.success(nextOnline ? "You are now online for new courier jobs." : "You are now offline.");
  }

  const courierReadyNow = Boolean(
    profile?.ualbanyIdUploaded ||
      profile?.ualbanyIdImage?.trim() ||
      user?.ualbanyIdUploaded ||
      user?.ualbanyIdImage?.trim() ||
      profile?.courierMode ||
      user?.courierMode ||
      profile?.role === "courier" ||
      user?.role === "courier" ||
      ualbanyIdImage.trim(),
  );
  const foodReady = Boolean(profile?.foodSafetyVerified);
  const browserSupported = browserNotificationsSupported();
  const hasPreviewableIdImage = isPreviewableImage(ualbanyIdImage);

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Button onClick={() => navigate(getDefaultPath(preferredView))} variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="mt-4 grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardContent className="flex flex-col items-center p-8 text-center">
              <Avatar className="mb-4 h-24 w-24">
                <AvatarFallback>{profile?.name?.split(" ").map((part) => part[0]).join("") || "CC"}</AvatarFallback>
              </Avatar>
              <h1 className="text-2xl font-bold text-[var(--ink)]">{profile?.name}</h1>
              <p className="text-sm text-[var(--muted)]">{profile?.email}</p>
              <p className="text-sm text-[var(--muted)]">{profile?.phone || "No phone added yet"}</p>
              <Badge className="mt-3" variant="secondary">
                {preferredView === "courier" ? "Courier side active" : "Requester side active"}
              </Badge>
              <div className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
                <div className="rounded-xl bg-[var(--surface-tint)] p-4">
                  <p className="text-sm text-[var(--muted)]">Rating</p>
                  <p className="text-lg font-semibold text-[var(--ink)]">{profile?.rating ?? 0}/5</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-tint)] p-4">
                  <p className="text-sm text-[var(--muted)]">Completed</p>
                  <p className="text-lg font-semibold text-[var(--ink)]">{profile?.completedJobs ?? 0} jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {setupCourier ? (
              <Card className="border-[var(--brand-accent)] bg-[var(--gold-soft)]/40">
                <CardHeader>
                  <CardTitle>Set up your courier side</CardTitle>
                  <CardDescription>
                    Complete the checks required to accept food delivery jobs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${courierReadyNow ? "text-green-700" : "text-[var(--muted)]"}`} />
                      <p className="font-medium text-[var(--ink)]">1. Upload your ID</p>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">Confirm UAlbany student status.</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${foodReady ? "text-green-700" : "text-[var(--muted)]"}`} />
                      <p className="font-medium text-[var(--ink)]">2. Verify food delivery</p>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">Required before accepting food orders.</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${Boolean(profile?.courierOnline) ? "text-green-700" : "text-[var(--muted)]"}`} />
                      <p className="font-medium text-[var(--ink)]">3. Go online</p>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">Receive open campus jobs while available.</p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Account overview</CardTitle>
                <CardDescription>Your trust, activity, and courier availability</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-[var(--surface-tint)] p-4">
                  <ShieldCheck className="mb-3 h-5 w-5 text-[var(--brand-maroon)]" />
                  <p className="font-medium text-[var(--ink)]">Campus trust</p>
                  <p className="text-sm text-[var(--muted)]">
                    Restricted to `.edu` sign-ins and courier verification for food safety.
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] p-4">
                  <Star className="mb-3 h-5 w-5 text-[var(--brand-gold)]" />
                  <p className="font-medium text-[var(--ink)]">Requests posted</p>
                  <p className="text-sm text-[var(--muted)]">{profile?.postedRequests ?? 0} posted so far.</p>
                </div>
                <div className="rounded-2xl bg-[var(--surface-tint)] p-4">
                  <Wallet className="mb-3 h-5 w-5 text-green-700" />
                  <p className="font-medium text-[var(--ink)]">Courier earnings</p>
                  <p className="text-sm text-[var(--muted)]">${profile?.earnings ?? 0} earned through campus runs.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Side settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                  <div>
                    <p className="font-medium text-[var(--ink)]">Current side</p>
                    <p className="text-sm text-[var(--muted)]">Active role for this session.</p>
                  </div>
                  <Badge variant="secondary">
                    {preferredView === "courier" ? "Courier side" : "User side"}
                  </Badge>
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[var(--ink)]">Courier ID check</p>
                      <p className="text-sm text-[var(--muted)]">
                        {courierReadyNow
                          ? "UAlbany ID is on file."
                          : "Upload a UAlbany ID photo before taking courier jobs."}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {courierReadyNow ? "ID uploaded" : "ID needed"}
                    </Badge>
                  </div>
                  <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-tint)] p-4">
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--ink)]" htmlFor="profile-ualbany-id">
                      <ImagePlus className="h-4 w-4 text-[var(--brand-accent)]" />
                      <span>{courierReadyNow ? "Replace your UAlbany ID photo if needed." : "Upload your UAlbany ID photo."}</span>
                    </label>
                    <Input
                      accept="image/*"
                      className="mt-3"
                      id="profile-ualbany-id"
                      onChange={(event) => void handleIdImageChange(event)}
                      type="file"
                    />
                  </div>
                  {hasPreviewableIdImage ? (
                    <img
                      alt="Saved UAlbany ID preview"
                      className="mt-3 max-h-44 rounded-xl border border-[var(--border)] object-cover"
                      src={ualbanyIdImage}
                    />
                  ) : courierReadyNow ? (
                    <p className="mt-3 rounded-xl border border-[var(--border)] bg-white p-3 text-sm text-[var(--muted)]">
                      UAlbany ID is saved. Upload a new photo to replace the file on record.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[var(--ink)]">Food safety verification</p>
                      <p className="text-sm text-[var(--muted)]">Email code required for food delivery access.</p>
                    </div>
                    <Badge variant="secondary">
                      {profile?.foodSafetyVerified ? "Verified" : "Verification needed"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <Button onClick={() => void requestVerificationCode()} type="button" variant="secondary">
                      <MailCheck className="mr-2 h-4 w-4" />
                      Send Code
                    </Button>
                    <Input
                      onChange={(event) => setVerificationCode(event.target.value)}
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                    />
                    <Button onClick={() => void verifyCourierEmail()} type="button">
                      Verify Email
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[var(--ink)]">Notifications</p>
                      <p className="text-sm text-[var(--muted)]">Message updates and new-job alerts.</p>
                    </div>
                    <Badge variant="secondary">
                      {profile?.notificationsEnabled ? "On" : "Off"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-[var(--muted)]">
                      {browserSupported
                        ? "Uses browser notifications."
                        : "This browser does not support notifications yet."}
                    </div>
                    <Button
                      disabled={!browserSupported}
                      onClick={() => void handleNotificationToggle()}
                      type="button"
                      variant={profile?.notificationsEnabled ? "secondary" : "default"}
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      {profile?.notificationsEnabled ? "Turn Off Notifications" : "Turn On Notifications"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[var(--ink)]">Courier online mode</p>
                      <p className="text-sm text-[var(--muted)]">
                        Make yourself available for open campus jobs.
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {profile?.courierOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-[var(--muted)]">
                      {courierReadyNow
                        ? "New jobs appear in the courier feed."
                        : "Upload your UAlbany ID before going online."}
                    </div>
                    <Button
                      disabled={!courierReadyNow}
                      onClick={() => void handleCourierOnlineToggle()}
                      type="button"
                    >
                      <Footprints className="mr-2 h-4 w-4" />
                      {profile?.courierOnline ? "Go Offline" : "Go Online For Jobs"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <p className="mb-2 font-medium text-[var(--ink)]">Bio</p>
                  <Textarea onChange={(event) => setBio(event.target.value)} rows={4} value={bio} />
                  <div className="mt-3 flex justify-end">
                    <Button onClick={() => void saveBio()}>Save Profile</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
