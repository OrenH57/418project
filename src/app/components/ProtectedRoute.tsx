// File purpose:
// Route guard for authenticated pages.
// Waits for auth to load, then either renders the protected layout or redirects to login.

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] text-[var(--ink)]">
        <div className="rounded-3xl border border-[var(--border)] bg-white px-6 py-5 shadow-sm">
          Loading CampusConnect...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate replace to="/" />;
  }

  return <Outlet />;
}
