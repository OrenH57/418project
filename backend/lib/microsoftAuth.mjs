// File purpose:
// Microsoft ID token verification for campus-only sign-in.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { getAzureClientId, getAzureTenantId } from "./config.mjs";
import { isCampusEmail } from "./auth.mjs";

const microsoftJwks = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));

export async function verifyMicrosoftIdToken(idToken) {
  const azureClientId = getAzureClientId();
  const azureTenantId = getAzureTenantId();

  if (!azureClientId || !azureTenantId) {
    throw new Error("Microsoft sign-in is not configured on the backend yet.");
  }

  const { payload } = await jwtVerify(idToken, microsoftJwks, {
    audience: azureClientId,
    issuer: [
      `https://login.microsoftonline.com/${azureTenantId}/v2.0`,
      `https://sts.windows.net/${azureTenantId}/`,
    ],
  });

  if (payload.tid !== azureTenantId) {
    throw new Error("Only University at Albany Microsoft accounts are allowed.");
  }

  const email = String(
    payload.preferred_username || payload.email || payload.upn || "",
  ).trim().toLowerCase();

  if (!email || !isCampusEmail(email)) {
    throw new Error("Only campus Outlook addresses are allowed.");
  }

  return {
    email,
    name: String(payload.name || email.split("@")[0] || "UAlbany Student").trim(),
  };
}
