// Google OAuth is credential-gated, exactly like the Telegram / Microsoft Graph
// integrations: the provider is only wired into next-auth (and the "Continue
// with Google" button only shown) when BOTH env vars are present. With no keys
// set, this returns false everywhere and the app behaves as pure credentials
// auth — no dead button, no broken provider. Edge-safe (reads env only).
//
// When enabled, the user must register this redirect URI in the Google Cloud
// console: {origin}/api/auth/callback/google
export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
