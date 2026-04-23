// File purpose:
// Central route table for the frontend.
// Defines protected pages, redirects, and router-level error handling.

import { createBrowserRouter, Navigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { RequestService } from "./pages/RequestService";
import { DriverFeed } from "./pages/DriverFeed";
import { Messaging } from "./pages/Messaging";
import { Profile } from "./pages/Profile";
import { Ratings } from "./pages/Ratings";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthPage } from "./pages/AuthPage";
import { HelpInfo } from "./pages/HelpInfo";
import { RouteError } from "./pages/RouteError";
import { LandingPage } from "./pages/LandingPage";

export const router = createBrowserRouter([
  { path: "/", Component: LandingPage, errorElement: <RouteError /> },
  { path: "/auth", Component: AuthPage, errorElement: <RouteError /> },
  {
    errorElement: <RouteError />,
    Component: ProtectedRoute,
    children: [
      {
        path: "/",
        errorElement: <RouteError />,
        Component: Layout,
        children: [
          { path: "app", Component: Home },
          { path: "request", Component: RequestService },
          { path: "driver-feed", Component: DriverFeed },
          { path: "messages/:requestId", Component: Messaging },
          { path: "profile", Component: Profile },
          { path: "help", Component: HelpInfo },
          { path: "rate/:requestId", Component: Ratings },
          { path: "admin", Component: AdminDashboard },
          { path: "*", element: <Navigate replace to="/app" /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate replace to="/" /> },
]);
