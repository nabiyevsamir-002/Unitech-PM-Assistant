import { isGoogleConfigured } from "@/lib/oauth";
import { LoginForm } from "./login-form";

// Server wrapper: reads env-only config (Google enabled?) and the OAuth error
// query param, then renders the client form. Mirrors the settings page pattern
// (server reads config → passes flags to a client view).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <LoginForm googleEnabled={isGoogleConfigured()} oauthError={error ?? null} />
  );
}
