import React from "react";
import ReactDOM from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import App from "./app/App";
import { msalInstance } from "./app/lib/microsoftAuth";
import "./styles.css";

const ghRedirectKey = "campusconnect-gh-redirect";
const rawRedirect = sessionStorage.getItem(ghRedirectKey);
if (rawRedirect) {
  sessionStorage.removeItem(ghRedirectKey);
  try {
    const redirect = JSON.parse(rawRedirect) as { path?: string; search?: string; hash?: string };
    if (redirect.path?.startsWith("/")) {
      window.history.replaceState(
        null,
        "",
        `${redirect.path}${redirect.search || ""}${redirect.hash || ""}`,
      );
    }
  } catch {
    // Ignore malformed redirect state and let the router load the current URL.
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>,
);
