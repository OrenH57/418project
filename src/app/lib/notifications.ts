// File purpose:
// Small browser-notification helpers for the CampusConnect prototype.
// Keeps permission checks and simple local alerts out of page components.

export function browserNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function canSendBrowserNotifications() {
  return browserNotificationsSupported() && Notification.permission === "granted";
}

export async function requestBrowserNotificationPermission() {
  if (!browserNotificationsSupported()) {
    return "unsupported" as const;
  }

  if (Notification.permission === "granted") {
    return "granted" as const;
  }

  if (Notification.permission === "denied") {
    return "denied" as const;
  }

  return Notification.requestPermission();
}

export function sendBrowserNotification(title: string, options?: NotificationOptions) {
  if (!canSendBrowserNotifications()) {
    return null;
  }

  return new Notification(title, {
    badge: "/favicon.ico",
    icon: "/favicon.ico",
    ...options,
  });
}
