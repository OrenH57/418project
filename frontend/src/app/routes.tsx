// File purpose:
// Central route table for the frontend.
// Defines protected pages, redirects, and router-level error handling.

import { createBrowserRouter, Navigate } from "react-router-dom";
import { RouteError } from "./pages";
import { Layout, ProtectedRoute } from "./components";

export const router = createBrowserRouter([
  {
    path: "/",
    lazy: async () => {
      const { LandingPage } = await import("./pages/public/LandingPage");
      return { Component: LandingPage };
    },
    errorElement: <RouteError />,
  },
  {
    path: "/auth",
    lazy: async () => {
      const { AuthPage } = await import("./pages/public/AuthPage");
      return { Component: AuthPage };
    },
    errorElement: <RouteError />,
  },
  {
    errorElement: <RouteError />,
    Component: ProtectedRoute,
    children: [
      {
        path: "/",
        errorElement: <RouteError />,
        Component: Layout,
        children: [
          {
            path: "app",
            lazy: async () => {
              const { Home } = await import("./pages/app/Home");
              return { Component: Home };
            },
          },
          {
            path: "request",
            lazy: async () => {
              const { RequestService } = await import("./pages/app/RequestService");
              return { Component: RequestService };
            },
          },
          {
            path: "driver-feed",
            lazy: async () => {
              const { DriverFeed } = await import("./pages/app/DriverFeed");
              return { Component: DriverFeed };
            },
          },
          {
            path: "messages/:requestId",
            lazy: async () => {
              const { Messaging } = await import("./pages/app/Messaging");
              return { Component: Messaging };
            },
          },
          {
            path: "profile",
            lazy: async () => {
              const { Profile } = await import("./pages/app/Profile");
              return { Component: Profile };
            },
          },
          {
            path: "help",
            lazy: async () => {
              const { HelpInfo } = await import("./pages/app/HelpInfo");
              return { Component: HelpInfo };
            },
          },
          {
            path: "rate/:requestId",
            lazy: async () => {
              const { Ratings } = await import("./pages/app/Ratings");
              return { Component: Ratings };
            },
          },
          {
            path: "admin",
            lazy: async () => {
              const { AdminDashboard } = await import("./pages/app/AdminDashboard");
              return { Component: AdminDashboard };
            },
          },
          { path: "*", element: <Navigate replace to="/app" /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate replace to="/" /> },
]);
