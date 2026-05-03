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
  DollarSign,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { LandingHeroGraphic } from "../../components/marketing/LandingHeroGraphic";
import { UAlbanyMark } from "../../components/brand/UAlbanyMark";
import { openGetMobile } from "../../lib/getMobile";

const featureCards = [
  {
    title: "Get Food Delivered",
    body: "Order in GET first, then have another student bring it to your dorm, library, or study spot.",
    icon: UtensilsCrossed,
  },
  {
    title: "Built For Campus Nights",
    body: "Best for students who are studying late, working, or staying in and do not want to leave their spot.",
    icon: Clock3,
  },
  {
    title: "Earn On Nearby Runs",
    body: "Pick up delivery requests that already fit your route and help other students get food fast.",
    icon: DollarSign,
  },
];

const stats = [
  { value: "1", label: "Order in GET" },
  { value: "2", label: "Request delivery" },
  { value: "3", label: "Meet your courier" },
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page min-h-screen bg-[var(--page-bg)] pb-28 sm:pb-0">
      <div className="ua-banner border-b border-[var(--border-strong)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs tracking-[0.18em] uppercase">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--brand-gold)]" />
            University at Albany Student Delivery Network
          </span>
          <span className="hidden text-white/75 sm:inline">Campus Center Pickup Across Campus</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        <section className="landing-shell rounded-xl p-5 sm:p-7 lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div>
              <div className="mb-5 flex items-center gap-3">
                <UAlbanyMark />
                <div>
                  <p className="text-sm font-semibold text-[var(--brand-maroon)]">UAlbany CampusConnect</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Campus food delivery network</p>
                </div>
              </div>

              <Badge className="mb-3 gap-2 rounded-full px-4 py-2 text-xs" variant="secondary">
                <Sparkles className="h-3.5 w-3.5" />
                UAlbany-only food delivery
              </Badge>

              <h1 className="max-w-3xl text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-[var(--ink)] sm:text-5xl lg:text-6xl">
                Your campus favorites, delivered wherever you are.
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                Campus restaurants do not deliver to dorms, so CampusConnect lets students request delivery from verified student couriers.
              </p>

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--brand-accent)]" />
                  Delivery request takes under a minute
                </span>
                <span className="inline-flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--brand-accent)]" />
                  UAlbany .edu sign-in only
                </span>
                <span className="inline-flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-[var(--brand-accent)]" />
                  Keep ordering inside GET
                </span>
              </div>

              <div className="mt-7 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4">
                  <div className="max-w-xl">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Ready to eat?</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Get your Campus Center order delivered</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)] sm:text-base">
                      Start with your food order in GET. Then request a student courier here and stay where you are.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                    <Button
                      className="landing-action-bubbles w-full rounded-lg text-base"
                      onClick={() => navigate("/auth?side=requester")}
                      size="lg"
                    >
                      Request Delivery
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button className="landing-action-bubbles w-full rounded-lg" onClick={() => openGetMobile()} size="lg" variant="outline">
                      Open GET First
                    </Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-2 border-t border-[var(--border)] pt-4 sm:grid-cols-3">
                  {stats.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--gold-soft)] font-semibold text-[var(--brand-maroon)]">
                        {item.value}
                      </span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-[var(--border)] bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Want to earn?</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Pick up nearby campus food runs when they fit your route.</p>
                  </div>
                  <Button className="landing-action-bubbles rounded-lg sm:min-w-44" onClick={() => navigate("/auth?side=courier")} size="lg" variant="secondary">
                    Earn as Courier
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <LandingHeroGraphic />
              <Card className="overflow-hidden bg-white shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Why students use it</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--ink)]">Campus food without the walk</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-[var(--surface-tint)] p-4">
                      <Shield className="h-5 w-5 text-[var(--brand-accent)]" />
                      <p className="mt-3 font-semibold text-[var(--ink)]">Campus-only delivery</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Requests and couriers are limited to UAlbany students.</p>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-tint)] p-4">
                      <CheckCircle2 className="h-5 w-5 text-[var(--brand-accent)]" />
                      <p className="mt-3 font-semibold text-[var(--ink)]">GET first, delivery here</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Order in GET first, then track the campus handoff here.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-5 hidden gap-4 lg:grid lg:grid-cols-3">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="bg-white shadow-sm">
                <CardContent className="flex min-h-36 items-start gap-4 p-5 xl:p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--brand-accent)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="pt-1">
                    <p className="font-semibold text-[var(--ink)]">{card.title}</p>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{card.body}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 p-3 shadow-sm sm:hidden">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <Button className="landing-action-bubbles min-h-12 flex-1 rounded-lg" onClick={() => navigate("/auth?side=requester")} size="lg">
            Order
          </Button>
          <Button className="landing-action-bubbles min-h-12 rounded-lg px-4" onClick={() => openGetMobile()} size="lg" variant="outline">
            GET
          </Button>
          <Button className="landing-action-bubbles min-h-12 rounded-lg px-4" onClick={() => navigate("/auth?side=courier")} size="lg" variant="secondary">
            Earn
          </Button>
        </div>
      </div>
    </div>
  );
}
