// File purpose:
// Simple help and info page.
// Explains the main campus app flows in plain language for students.

import { ArrowLeft, CircleHelp, Footprints, Shield, UtensilsCrossed } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const helpCards = [
  {
    title: "How to order food",
    body: "Order in GET, request delivery, and coordinate the handoff in chat.",
    icon: UtensilsCrossed,
  },
  {
    title: "How to be a courier",
    body: "Open the courier side, verify food delivery, accept a job, and use quick chat updates during the handoff.",
    icon: Footprints,
  },
  {
    title: "How safety works",
    body: ".edu sign-in, courier verification, and public campus handoffs keep requests accountable.",
    icon: Shield,
  },
];

export function HelpInfo() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Button onClick={() => navigate(-1)} variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[var(--ink)]">
              <CircleHelp className="h-5 w-5 text-[var(--brand-accent)]" />
              Help and Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-[var(--surface-tint)] p-4 text-sm text-[var(--muted)]">
              CampusConnect keeps Campus Center pickup, payment, chat, and drop-off details in one workflow.
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {helpCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--brand-accent)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="font-semibold text-[var(--ink)]">{card.title}</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">{card.body}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
