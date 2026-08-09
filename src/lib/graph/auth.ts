// Microsoft Graph auth (track 5d) — app-only client-credentials flow.
// Credential-gated: everything no-ops / throws a clear error until the Azure app
// registration env vars are set:
//   MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID, MSGRAPH_CLIENT_SECRET
// The app needs Files.ReadWrite.All (application) permission with admin consent.

const TENANT = process.env.MSGRAPH_TENANT_ID;
const CLIENT_ID = process.env.MSGRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.MSGRAPH_CLIENT_SECRET;

export function isGraphConfigured(): boolean {
  return !!(TENANT && CLIENT_ID && CLIENT_SECRET);
}

let cached: { token: string; expiresAt: number } | null = null;

/** Fetch (and cache) an app-only Graph access token. Throws if unconfigured. */
export async function getGraphToken(): Promise<string> {
  if (!isGraphConfigured()) {
    throw new Error("Microsoft Graph is not configured (MSGRAPH_* env).");
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Graph token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cached.token;
}

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
