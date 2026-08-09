"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Sparkles, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useI18n } from "@/components/providers/i18n-provider";

const DEMO_ACCOUNTS = [
  { email: "owner@unitech.az", role: "OWNER" },
  { email: "pm@unitech.az", role: "PM" },
  { email: "nigar@unitech.az", role: "MEMBER" },
];

// Multicolour Google "G" — inline SVG so we add no icon dependency.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function LoginForm({
  googleEnabled,
  oauthError,
  showDemo,
}: {
  googleEnabled: boolean;
  oauthError: string | null;
  showDemo: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const doLogin = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email: creds?.email ?? email,
      password: creds?.password ?? password,
      totp: creds ? "" : totp,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t.auth.invalidCredentials);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">{t.common.appName}</h1>
          <p className="text-sm text-muted-foreground">{t.common.appTagline}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.auth.signInTitle}</CardTitle>
            <CardDescription>{t.auth.signInSubtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {oauthError && (
              <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t.auth.googleSignInFailed}
              </p>
            )}

            {googleEnabled && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                >
                  <GoogleIcon className="size-4" />
                  {t.auth.continueWithGoogle}
                </Button>
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{t.auth.or}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form onSubmit={doLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.auth.email}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@unitech.az"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t.auth.password}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totp">{t.auth.totpCode}</Label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                />
                <p className="text-xs text-muted-foreground">{t.auth.totpHint}</p>
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  t.auth.signingIn
                ) : (
                  <>
                    <LogIn className="size-4" />
                    {t.auth.signIn}
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <Link
                  href="/register"
                  className="font-medium text-primary hover:underline"
                >
                  {t.auth.createAccount}
                </Link>
                <Link
                  href="/reset-password"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t.auth.forgotPassword}
                </Link>
              </div>
            </form>

            {/* Demo quick-login accounts expose plaintext credentials, so they
                are shown ONLY in development — never on the public production
                login page (see login/page.tsx: showDemo). */}
            {showDemo && (
              <div className="mt-6 border-t pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t.auth.demoAccounts} · şifrə: demo1234
                </p>
                <div className="grid gap-1.5">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        doLogin(undefined, {
                          email: acc.email,
                          password: "demo1234",
                        })
                      }
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <span>{acc.email}</span>
                      <span className="text-xs text-muted-foreground">
                        {(t.role as Record<string, string>)[acc.role]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
