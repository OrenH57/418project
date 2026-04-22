// File purpose:
// Shared app shell for protected pages.
// Renders the top navigation, help entry, logout, and common page framing.

import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bike, CircleHelp, House, LogOut, UserRound } from "lucide-react";
import { QuickRequestButton } from "./QuickRequestButton";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { getDefaultPath, getStoredView, setStoredView, type AppView } from "../lib/viewMode";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdminPage = location.pathname.startsWith("/admin");
  const preferredView = getStoredView();
  const showQuickRequest =
    !isAdminPage && location.pathname !== "/request" && user && preferredView === "requester";

  function switchView(nextView: AppView) {
    if (nextView === "courier" && !user?.ualbanyIdUploaded) {
      navigate("/profile?setup=courier");
      return;
    }

    setStoredView(nextView);
    navigate(getDefaultPath(nextView));
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="ua-banner border-b border-[var(--border-strong)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs tracking-[0.18em] uppercase">
          <span>University at Albany Student Delivery Network</span>
          <span className="text-white/75">Campus Center Pickup to Anywhere On Campus</span>
        </div>
      </div>
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => navigate("/")}
            type="button"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-maroon)] text-white">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[var(--ink)]">CampusConnect</p>
              <p className="text-xs text-[var(--muted)]">UAlbany student pickup and delivery</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {preferredView === "requester" ? (
              <>
                <Button
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => switchView("courier")}
                  size="sm"
                  variant="ghost"
                >
                  <Bike className="mr-1.5 h-3.5 w-3.5" />
                  Make extra cash
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => switchView("requester")}
                  size="sm"
                  variant="ghost"
                >
                  <House className="mr-1.5 h-3.5 w-3.5" />
                  Need something?
                </Button>
              </>
            )}
            <Button onClick={() => navigate("/profile")} variant="ghost">
              <UserRound className="mr-2 h-4 w-4" />
              Profile
            </Button>
            <Button
              aria-label="Help and info"
              className="px-3"
              onClick={() => navigate("/help")}
              variant="ghost"
            >
              <CircleHelp className="h-4 w-4" />
            </Button>
            {user ? (
              <Badge variant="secondary" className="hidden md:inline-flex">
                {preferredView === "courier" ? "Courier side" : "User side"}
              </Badge>
            ) : null}
            <Button
              onClick={() => {
                logout();
                navigate("/auth");
              }}
              variant="outline"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          </div>
        </div>
      </header>

      <Outlet />
      {showQuickRequest ? <QuickRequestButton /> : null}
    </div>
  );
}
