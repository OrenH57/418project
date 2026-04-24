// File purpose:
// Shared helpers for the app's two-side experience.
// Keeps the selected side consistent across auth, layout, requester pages, and courier pages.

export const VIEW_KEY = "campus-connect-view";

export type AppView = "requester" | "courier";

export function getStoredView(): AppView {
  return (localStorage.getItem(VIEW_KEY) as AppView | null) || "requester";
}

export function setStoredView(view: AppView) {
  localStorage.setItem(VIEW_KEY, view);
}

export function getDefaultPath(view: AppView) {
  return view === "courier" ? "/driver-feed" : "/app";
}
