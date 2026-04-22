// File purpose:
// Prototype admin summary page.
// Shows high-level moderation and platform status cards for milestone/demo use.

import { Activity, AlertTriangle, ChartNoAxesColumn, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const flaggedItems = [
  { id: "R-102", reason: "Late pickup dispute", status: "Reviewing" },
  { id: "U-443", reason: "Repeated missed handoff reports", status: "Escalated" },
  { id: "P-077", reason: "Payment confirmation needed", status: "Pending" },
];

export function AdminDashboard() {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 rounded-[1.75rem] border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted)]">Control Center</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--ink)]">Admin Dashboard</h1>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            { label: "Active Users", value: "1,284", icon: Users },
            { label: "Open Requests", value: "214", icon: Activity },
            { label: "Flagged Cases", value: "12", icon: AlertTriangle },
            { label: "Gross Volume", value: "$18.4k", icon: ChartNoAxesColumn },
          ].map((item) => (
            <Card key={item.label} className="bg-white">
              <CardContent className="p-5">
                <item.icon className="mb-4 h-5 w-5 text-[var(--brand-maroon)]" />
                <p className="text-sm text-[var(--muted)]">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Moderation queue</CardTitle>
              <CardDescription>Items that need manual review today</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {flaggedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-4"
                >
                  <div>
                    <p className="font-medium text-[var(--ink)]">{item.id}</p>
                    <p className="text-sm text-[var(--muted)]">{item.reason}</p>
                  </div>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-[var(--surface-tint)] p-4">
                <p className="text-sm text-[var(--muted)]">Response time</p>
                <p className="mt-1 text-xl font-semibold text-[var(--ink)]">2.8 minutes</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-tint)] p-4">
                <p className="text-sm text-[var(--muted)]">Successful completions</p>
                <p className="mt-1 text-xl font-semibold text-[var(--ink)]">94.2%</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-tint)] p-4">
                <p className="text-sm text-[var(--muted)]">Support backlog</p>
                <p className="mt-1 text-xl font-semibold text-[var(--ink)]">7 open tickets</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
