"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";
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
import { requestPasswordReset, resetPassword } from "@/app/actions/password-reset";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify" | "done">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rp = t.resetPassword;

  const doRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDevCode(res.devCode ?? null);
    setNotice(res.message);
    setStep("verify");
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(rp.mismatch);
      return;
    }
    if (password.length < 8) {
      setError(rp.tooShort);
      return;
    }
    setLoading(true);
    const res = await resetPassword(email, code, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setNotice(res.message);
    setStep("done");
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
            <CardTitle>{rp.title}</CardTitle>
            <CardDescription>
              {step === "verify" ? rp.verifySubtitle : rp.requestSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "done" ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-3 text-sm text-success">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <span>{notice}</span>
                </div>
                <Button className="w-full" onClick={() => router.push("/login")}>
                  {rp.backToLogin}
                </Button>
              </div>
            ) : step === "request" ? (
              <form onSubmit={doRequest} className="space-y-4">
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
                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? rp.sending : (
                    <>
                      <KeyRound className="size-4" />
                      {rp.sendCode}
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={doReset} className="space-y-4">
                {notice && (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {notice}
                  </p>
                )}
                {devCode && (
                  <p className="rounded-md border border-dashed border-primary/40 bg-primary/[0.04] px-3 py-2 text-xs">
                    {rp.devNote}{" "}
                    <b className="font-mono tracking-widest">{devCode}</b>
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="code">{rp.code}</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="123456"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newpass">{rp.newPassword}</Label>
                  <Input
                    id="newpass"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{rp.confirmPassword}</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? rp.submitting : rp.submit}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setStep("request");
                    setError(null);
                    setNotice(null);
                    setDevCode(null);
                  }}
                >
                  {rp.changeEmail}
                </button>
              </form>
            )}

            <div className="mt-6 border-t pt-4">
              <Link
                href="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {rp.backToLogin}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
