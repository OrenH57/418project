import { PublicClientApplication } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin;

export const isMicrosoftAuthConfigured = Boolean(clientId && tenantId);

export const microsoftLoginRequest = {
  scopes: ["openid", "profile", "email"],
  prompt: "select_account",
};

export function clearMicrosoftAuthCache() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith("msal.") || key.includes("login.windows.net") || key.includes("login.microsoftonline.com")) {
        storage.removeItem(key);
      }
    }
  }
}

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: clientId || "missing-client-id",
    authority: `https://login.microsoftonline.com/${tenantId || "common"}`,
    redirectUri,
  },
  cache: {
    cacheLocation: "localStorage",
  },
});
