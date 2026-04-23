// File purpose:
// Public marketing-style landing page for CampusConnect.
// Lets students understand the product before they choose to log in or sign up.

import { useNavigate } from "react-router-dom";
import { Clock3, Shield, UtensilsCrossed, Car, DollarSign } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { LandingHeroGraphic } from "../components/LandingHeroGraphic";
import { openGetMobile } from "../lib/getMobile";

const featureCards = [
  {
    title: "Order Food",
    body: "Order in GET, send the delivery request here, and have another student bring it to you.",
    icon: UtensilsCrossed,
  },
  {
    title: "Order a Ride",
    body: "Book a quick ride across campus when the walk is too much.",
    icon: Car,
  },
  {
    title: "Make Extra Cash",
    body: "Take nearby jobs between classes, earn quick money, and do it without needing a car.",
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
          <span className="hidden text-white/75 sm:inline">Campus Center Pickup to Anywhere On Campus</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
        <section className="rounded-[1.5rem] border border-[var(--border)] bg-white p-5 sm:rounded-[2rem] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <Badge className="mb-2" variant="secondary">
                UAlbany student-to-student delivery
              </Badge>
              <h1 className="max-w-3xl text-3xl font-bold leading-tight text-[var(--ink)] sm:text-5xl">
                Order food, rides, and campus help without the extra campus trip.
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-[var(--muted)] sm:text-lg">
                CampusConnect helps UAlbany students order food, request rides, and get simple campus help from other students.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Need Help?</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--ink)]">Place an order</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Order food, request a ride, or ask for help, then follow the request in one place.
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button className="w-full" onClick={() => navigate("/auth?side=requester")} size="lg">
                      I Want To Order
                    </Button>
                    <Button className="w-full" onClick={() => openGetMobile()} variant="outline">
                      Open GET Ordering
                    </Button>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-[var(--brand-accent)] bg-[var(--gold-soft)]/35 p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Want To Earn?</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--ink)]">Become a deliverer</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Take nearby campus delivery jobs, earn quick money between classes, and do it without needing a car.
                  </p>
                  <div className="mt-4">
                    <Button className="w-full" onClick={() => navigate("/auth?side=courier")} size="lg" variant="secondary">
                      I Want To Deliver
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-3 py-2">
                  <Clock3 className="h-4 w-4 text-[var(--brand-accent)]" />
                  Fast on busy class days
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-tint)] px-3 py-2">
                  <Shield className="h-4 w-4 text-[var(--brand-accent)]" />
                  `.edu` accounts only
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <LandingHeroGraphic />
              <Card className="bg-[var(--surface-tint)]">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">1</p>
                    <p className="mt-1 font-semibold text-[var(--ink)]">Order in GET</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">2</p>
                    <p className="mt-1 font-semibold text-[var(--ink)]">Send the request here</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">3</p>
                    <p className="mt-1 font-semibold text-[var(--ink)]">Meet your courier</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-3">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardContent className="p-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-tint)] text-[var(--brand-accent)] sm:h-11 sm:w-11">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-[var(--ink)]">{card.title}</p>
                  <p className="mt-1.5 text-sm text-[var(--muted)]">{card.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </div>
  );
}
