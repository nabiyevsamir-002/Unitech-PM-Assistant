"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  startTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
} from "@/app/actions/totp";

type Enrollment = { secret: string; formatted: string; otpauth: string };

export function TotpManager({ enabled: initialEnabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const onStart = () =>
    startTransition(async () => {
      const res = await startTotpEnrollment();
      if (res.ok && res.secret) {
        setEnrollment({
          secret: res.secret,
          formatted: res.formatted ?? res.secret,
          otpauth: res.otpauth ?? "",
        });
        setCode("");
      } else {
        toast.error(res.message);
      }
    });

  const onConfirm = () =>
    startTransition(async () => {
      const res = await confirmTotpEnrollment(code);
      if (res.ok) {
        toast.success(res.message);
        setEnabled(true);
        setEnrollment(null);
        setCode("");
      } else {
        toast.error(res.message);
      }
    });

  const onDisable = () =>
    startTransition(async () => {
      const res = await disableTotp(code);
      if (res.ok) {
        toast.success(res.message);
        setEnabled(false);
        setEnrollment(null);
        setCode("");
      } else {
        toast.error(res.message);
      }
    });

  const onCancel = () =>
    startTransition(async () => {
      await disableTotp(""); // clears the pending (not-yet-enabled) secret
      setEnrollment(null);
      setCode("");
    });

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable — the key is shown for manual entry anyway */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? (
            <ShieldCheck className="size-4.5 text-success" />
          ) : (
            <ShieldOff className="size-4.5 text-muted-foreground" />
          )}
          {t.settings.twoFactor}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t.settings.twoFactorDesc}
        </p>

        {/* Enabled state */}
        {enabled && !enrollment && (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-success">
              <ShieldCheck className="size-4" />
              {t.settings.twoFactorOn}
            </p>
            <div className="space-y-2">
              <Label htmlFor="totp-disable">{t.settings.enterCode}</Label>
              <div className="flex gap-2">
                <Input
                  id="totp-disable"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="max-w-40"
                />
                <Button
                  variant="destructive"
                  disabled={pending || code.length !== 6}
                  onClick={onDisable}
                >
                  {t.settings.disable2fa}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Disabled, not enrolling */}
        {!enabled && !enrollment && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {t.settings.twoFactorOff}
            </span>
            <Button disabled={pending} onClick={onStart}>
              {t.settings.enable2fa}
            </Button>
          </div>
        )}

        {/* Enrolling */}
        {enrollment && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t.settings.twoFactorSetupTitle}</p>
            <p className="text-xs text-muted-foreground">
              {t.settings.twoFactorSetupHint}
            </p>
            <div className="space-y-1.5">
              <Label>{t.settings.secretKey}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider">
                  {enrollment.formatted}
                </code>
                <Button variant="outline" size="icon" onClick={copySecret} title={t.settings.copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totp-confirm">{t.settings.enterCode}</Label>
              <Input
                id="totp-confirm"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="max-w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={pending || code.length !== 6} onClick={onConfirm}>
                {t.settings.confirm2fa}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={onCancel}>
                {t.settings.cancel2fa}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
