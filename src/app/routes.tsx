// File purpose:
// Central route table for the frontend.
// Defines protected pages, redirects, and router-level error handling.

import { createBrowserRouter, Navigate } from "react-router-dom";
import {
  AdminDashboard,
  AuthPage,
  DriverFeed,
  HelpInfo,
  Home,
  LandingPage,
  Messaging,
  Profile,
  Ratings,
  RequestService,
  RouteError,
} from "./pages";
import { Layout, ProtectedRoute } from "./components";

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
