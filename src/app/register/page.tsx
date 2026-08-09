"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, UserPlus, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
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
import { registerUser } from "@/app/actions/register";

export default function RegisterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<"form" | "done">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rg = t.register;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(rg.mismatch);
      return;
    }
    if (password.length < 8) {
      setError(rg.tooShort);
      return;
    }
    setLoading(true);
    try {
      const res = await registerUser({ name, email, password });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice(res.message);
      setStep("done");
    } catch {
      // A transient server error (e.g. mid-deploy) must NOT leave the button
      // stuck on "Submitting…" forever — reset and show a retry message.
      setError(rg.error);
    } finally {
      setLoading(false);
    }
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
            <CardTitle>{rg.title}</CardTitle>
            <CardDescription>{rg.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === "done" ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md bg-success/10 px-3 py-3 text-sm text-success">
                  <Clock className="mt-0.5 size-5 shrink-0" />
                  <span>{notice}</span>
                </div>
                <Button className="w-full" onClick={() => router.push("/login")}>
                  {rg.backToLogin}
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t.common.name}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t.auth.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ad@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{rg.password}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{rg.confirmPassword}</Label>
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

                <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                  {rg.approvalNote}
                </p>

                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? rg.submitting : (
                    <>
                      <UserPlus className="size-4" />
                      {rg.submit}
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 border-t pt-4">
              <Link
                href="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {rg.haveAccount}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
