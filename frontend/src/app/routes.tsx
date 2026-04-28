// File purpose:
// Central route table for the frontend.
// Defines protected pages, redirects, and router-level error handling.

import type { ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RouteError } from "./pages";
import { Layout, ProtectedRoute } from "./components";

const routerBasename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");

function protectedPage(path: string, lazy: () => Promise<{ Component: ComponentType }>) {
  return {
    path,
    errorElement: <RouteError />,
    Component: ProtectedRoute,
    children: [
      {
        Component: Layout,
        children: [{ index: true, lazy }],
      },
    ],
  };
}

export const router = createBrowserRouter(
  [
    protectedPage("/app", async () => {
      const { Home } = await import("./pages/app/Home");
      return { Component: Home };
    }),
    protectedPage("/request", async () => {
      const { RequestService } = await import("./pages/app/RequestService");
      return { Component: RequestService };
    }),
    protectedPage("/driver-feed", async () => {
      const { DriverFeed } = await import("./pages/app/DriverFeed");
      return { Component: DriverFeed };
    }),
    protectedPage("/messages/:requestId", async () => {
      const { Messaging } = await import("./pages/app/Messaging");
      return { Component: Messaging };
    }),
    protectedPage("/profile", async () => {
      const { Profile } = await import("./pages/app/Profile");
      return { Component: Profile };
    }),
    protectedPage("/help", async () => {
      const { HelpInfo } = await import("./pages/app/HelpInfo");
      return { Component: HelpInfo };
    }),
    protectedPage("/rate/:requestId", async () => {
      const { Ratings } = await import("./pages/app/Ratings");
      return { Component: Ratings };
    }),
    protectedPage("/admin", async () => {
      const { AdminDashboard } = await import("./pages/app/AdminDashboard");
      return { Component: AdminDashboard };
    }),
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
    { path: "*", element: <Navigate replace to="/" /> },
  ],
  { basename: routerBasename },
);
