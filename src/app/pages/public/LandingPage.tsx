// File purpose:
// Public marketing-style landing page for CampusConnect.
// Lets students understand the product before they choose to log in or sign up.

import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Shield,
  Sparkles,
  UtensilsCrossed,
  Car,
  DollarSign,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { LandingHeroGraphic } from "../../components/marketing/LandingHeroGraphic";
import { openGetMobile } from "../../lib/getMobile";

const featureCards = [
  {
    title: "Request Food Delivery",
    body: "Place your meal in GET first, then request student delivery here.",
    icon: UtensilsCrossed,
  },
  {
    title: "Order a Ride",
    body: "Get a faster trip across campus when time, weather, or energy make the walk a bad option.",
    icon: Car,
  },
  {
    title: "Make Extra Cash",
    body: "Pick up nearby requests for students studying, working on campus, or avoiding cold and dark late-night walks.",
    icon: DollarSign,
  },
];

const stats = [
  { value: "Under 1 min", label: "to post a request" },
  { value: "UAlbany-only", label: "verified campus access" },
  { value: "GET first", label: "for food ordering" },
];

const steps = [
  "Order food in GET first or choose a ride.",
  "Post the request in CampusConnect and wait for a verified student match.",
  "Track the request and meet up fast.",
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page min-h-screen bg-[var(--page-bg)] pb-28 sm:pb-0">
      <div className="ua-banner border-b border-[var(--border-strong)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs tracking-[0.18em] uppercase">
          <span>University at Albany Student Delivery Network</span>
          <span className="hidden text-white/75 sm:inline">Campus Center Pickup to Anywhere On Campus</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        <section className="landing-shell rounded-[2rem] p-5 sm:p-7 lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div>
              <Badge className="mb-3 gap-2 rounded-full px-4 py-2 text-xs" variant="secondary">
                <Sparkles className="h-3.5 w-3.5" />
                UAlbany-only delivery and rides
              </Badge>

              <h1 className="max-w-3xl text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-[var(--ink)] sm:text-5xl lg:text-6xl">
                Get food or a ride without leaving your dorm, library table, or late-night study spot.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                CampusConnect handles delivery and ride requests for UAlbany students. Food orders are placed in GET first, then tracked here.
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5 text-sm text-[var(--muted)]">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
                  <CheckCircle2 className="h-4 w-4 text-[var(--brand-accent)]" />
                  Built for study sessions, campus workdays, bad weather, and late nights
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
                  <Shield className="h-4 w-4 text-[var(--brand-accent)]" />
                  UAlbany `.edu` sign-in only
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
                  <UtensilsCrossed className="h-4 w-4 text-[var(--brand-accent)]" />
                  Food ordering stays in GET
                </span>
              </div>

              <div className="mt-7 hidden rounded-[1.75rem] border border-[var(--border)] bg-white/88 p-4 shadow-[0_20px_50px_rgba(45,34,39,0.08)] backdrop-blur sm:block sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-xl">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Start Here</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Request help in under a minute</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)] sm:text-base">
                      Skip the extra trip. Request delivery after ordering in GET, or book a ride and keep moving through your day.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:min-w-[360px]">
                    <Button
                      className="w-full rounded-2xl text-base shadow-[0_18px_30px_rgba(107,54,95,0.24)]"
                      onClick={() => navigate("/auth?side=requester")}
                      size="lg"
                    >
                      Request Food or Ride
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button className="w-full rounded-2xl" onClick={() => openGetMobile()} size="lg" variant="outline">
                      Order Food In GET First
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {stats.map((item) => (
                    <div key={item.label} className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <p className="text-lg font-semibold text-[var(--ink)]">{item.value}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">How It Works</p>
                  <div className="mt-3 space-y-3">
                    {steps.map((step, index) => (
                      <div key={step} className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-tint)] font-semibold text-[var(--brand-maroon)]">
                          {index + 1}
                        </div>
                        <p className="pt-1 text-sm leading-6 text-[var(--ink)]">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[var(--brand-accent)] bg-[linear-gradient(180deg,rgba(247,236,212,0.7),rgba(255,255,255,0.92))] p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Earn On Your Schedule</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--ink)]">Take nearby requests when they fit your route</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Earn by taking delivery and ride requests for students in dorms, libraries, and other campus spots that already line up with where you are going.
                  </p>
                  <div className="mt-4">
                    <Button className="w-full rounded-2xl" onClick={() => navigate("/auth?side=courier")} size="lg" variant="secondary">
                      Start Earning Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <LandingHeroGraphic />
              <Card className="overflow-hidden border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,244,235,0.9))]">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Why students use it</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--ink)]">Faster than making another campus trip yourself</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--muted)] shadow-sm">
                      <Clock3 className="h-4 w-4 text-[var(--brand-accent)]" />
                      Designed for dorms, libraries, workdays, and late nights
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-[var(--border)] bg-white/90 p-4">
                      <Shield className="h-5 w-5 text-[var(--brand-accent)]" />
                      <p className="mt-3 font-semibold text-[var(--ink)]">Trusted campus network</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Only verified UAlbany students can request, accept, and coordinate handoff.</p>
                    </div>
                    <div className="rounded-[1.25rem] border border-[var(--border)] bg-white/90 p-4">
                      <CheckCircle2 className="h-5 w-5 text-[var(--brand-accent)]" />
                      <p className="mt-3 font-semibold text-[var(--ink)]">One place to track everything</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Food runs, ride help, and courier communication stay in one streamlined flow.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="border-white/70 bg-white/80 backdrop-blur">
                <CardContent className="p-4">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(107,54,95,0.12),rgba(199,162,74,0.16))] text-[var(--brand-accent)] sm:h-12 sm:w-12">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-[var(--ink)]">{card.title}</p>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{card.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 p-3 shadow-[0_-12px_40px_rgba(45,34,39,0.12)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <Button className="min-h-12 flex-1 rounded-2xl" onClick={() => navigate("/auth?side=requester")} size="lg">
            Request
          </Button>
          <Button className="min-h-12 rounded-2xl px-4" onClick={() => openGetMobile()} size="lg" variant="outline">
            GET
          </Button>
          <Button className="min-h-12 rounded-2xl px-4" onClick={() => navigate("/auth?side=courier")} size="lg" variant="secondary">
            Earn
          </Button>
        </div>
      </div>
    </div>
  );
}
