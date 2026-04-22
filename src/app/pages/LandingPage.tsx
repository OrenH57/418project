// File purpose:
// Public marketing-style landing page for CampusConnect.
// Lets students understand the product before they choose to log in or sign up.

import { useNavigate } from "react-router-dom";
import { Bike, Clock3, Shield, UtensilsCrossed, Car, DollarSign } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { LandingHeroGraphic } from "../components/LandingHeroGraphic";
import { openGetMobile } from "../lib/getMobile";

const featureCards = [
  {
    title: "Order Food",
    body: "Place your GET order, upload the screenshot, and have another student bring it across campus.",
    icon: UtensilsCrossed,
  },
  {
    title: "Order a Ride",
    body: "Cold out or raining? Book a quick ride across campus without the long walk.",
    icon: Car,
  },
  {
    title: "Make Extra Cash",
    body: "Take nearby jobs between class, work, or the gym and get paid for your time.",
    icon: DollarSign,
  },
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--page-bg)]">
      <div className="ua-banner border-b border-[var(--border-strong)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs tracking-[0.18em] uppercase">
          <span>University at Albany Student Delivery Network</span>
          <span className="text-white/75">Campus Center Pickup to Anywhere On Campus</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        <section className="rounded-[1.5rem] border border-[var(--border)] bg-white p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <Badge className="mb-3" variant="secondary">
                UAlbany student-to-student delivery
              </Badge>
              <h1 className="max-w-3xl text-3xl font-bold leading-tight text-[var(--ink)] sm:text-5xl">
                Order food, rides, and campus help without the extra campus trip.
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-[var(--muted)] sm:mt-4 sm:text-lg">
                CampusConnect helps UAlbany students get food from Campus Center restaurants, book quick rides,
                and handle simple campus errands with help from other students.
              </p>
              <p className="mt-2 text-sm text-[var(--muted)] sm:hidden">
                Order in GET. A student brings it to you.
              </p>
              <div className="mt-4 grid gap-2 sm:mt-6 sm:flex sm:flex-wrap sm:gap-3">
                <Button className="w-full sm:w-auto" onClick={() => navigate("/auth")} size="lg">
                  Order Now
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => openGetMobile()}
                  size="lg"
                  variant="secondary"
                >
                  Open GET Ordering
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--muted)] sm:mt-6 sm:gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-3 py-2">
                  <Clock3 className="h-4 w-4 text-[var(--brand-accent)]" />
                  Built for long class days and finals week
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-3 py-2">
                  <Shield className="h-4 w-4 text-[var(--brand-accent)]" />
                  `.edu` accounts only
                </span>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <LandingHeroGraphic />
              <Card className="overflow-hidden border-none bg-[var(--brand-maroon)] text-white shadow-xl">
                <CardContent className="p-4 sm:p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 sm:mb-4 sm:h-12 sm:w-12">
                    <Bike className="h-6 w-6" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/70 sm:text-sm">How it works</p>
                  <div className="mt-3 grid gap-2 text-sm text-white/85 sm:mt-4 sm:space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-3 sm:p-4">
                      <p className="font-semibold text-white">1. Browse first</p>
                      <p className="mt-1">See what the app does before you make an account.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-3 sm:p-4">
                      <p className="font-semibold text-white">2. Sign in when you are ready</p>
                      <p className="mt-1">Use your campus email, then choose which side should open first.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-3 sm:p-4">
                      <p className="font-semibold text-white">3. Order or earn</p>
                      <p className="mt-1">Place an order, or switch sides and pick up nearby jobs for extra cash.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 md:mt-8 md:grid-cols-3 md:gap-4">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="border-[var(--border)] bg-white">
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--brand-accent)] sm:mb-4 sm:h-12 sm:w-12">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-[var(--ink)]">{card.title}</p>
                  <p className="mt-2 hidden text-sm text-[var(--muted)] sm:block">{card.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </div>
  );
}
