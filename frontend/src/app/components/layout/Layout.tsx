// File purpose:
// Shared app shell for protected pages.
// Renders the top navigation, help entry, logout, and common page framing.

import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bike, CircleHelp, LogOut, Shield, UserRound } from "lucide-react";
import { QuickRequestButton } from "./QuickRequestButton";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { getDefaultPath, getStoredView } from "../../lib/viewMode";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdminPage = location.pathname.startsWith("/admin");
  const preferredView = getStoredView();
  const showQuickRequest =
    !isAdminPage && location.pathname !== "/request" && user && preferredView === "requester";

  return (
    <div className="min-h-screen bg-transparent">
      <div className="ua-banner border-b border-[var(--border-strong)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs tracking-[0.18em] uppercase">
          <span>University at Albany Student Delivery Network</span>
          <span className="hidden text-white/75 sm:inline">Campus Center Pickup Across Campus</span>
        </div>
      </div>

      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => navigate(getDefaultPath(preferredView))}
            type="button"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-maroon)] text-white">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[var(--ink)]">CampusConnect</p>
              <p className="text-xs text-[var(--muted)]">Campus food delivery</p>
            </div>
          </button>

          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:flex sm:flex-wrap">
            {user?.role === "admin" ? (
              <Button
                className="min-w-0 justify-center rounded-full px-3 sm:justify-start"
                onClick={() => navigate("/admin")}
                size="sm"
                variant={isAdminPage ? "secondary" : "ghost"}
              >
                <Shield className="h-4 w-4 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Admin</span>
              </Button>
            ) : null}
            <Button
              className="min-w-0 justify-center rounded-full px-3 sm:justify-start"
              onClick={() => navigate("/profile")}
              size="sm"
              variant="ghost"
            >
              <UserRound className="h-4 w-4 sm:mr-2" />
              <span className="sr-only sm:not-sr-only">Profile</span>
            </Button>
            <Button
              aria-label="Help and info"
              className="rounded-full px-3"
              onClick={() => navigate("/help")}
              size="sm"
              variant="ghost"
            >
              <CircleHelp className="h-4 w-4" />
            </Button>
            {user ? (
              <Badge className="col-span-3 justify-center sm:col-auto sm:inline-flex" variant="secondary">
                {user.role === "admin" ? "Admin" : preferredView === "courier" ? "Courier" : "Customer"}
              </Badge>
            ) : null}
            <Button
              className="rounded-full px-3"
              onClick={() => {
                logout();
                navigate("/");
              }}
              size="sm"
              variant="outline"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <Outlet />
      {showQuickRequest ? <QuickRequestButton /> : null}
    </div>
  );
}
