"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Circle, Rocket, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RoleBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { TeamManager } from "./team-manager";
import { TotpManager } from "./totp-manager";
import { NotificationsCard } from "./notifications-card";
import { ChangePasswordCard } from "./change-password-card";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import type { UserDTO } from "@/lib/types";

export function SettingsView({
  user,
  team,
  model,
  canManage,
  currentUserId,
  totp,
  notifyChannels,
}: {
  user: { name: string; email: string; role: string };
  team: UserDTO[];
  model: string;
  canManage: boolean;
  currentUserId: string;
  totp: { eligible: boolean; enabled: boolean };
  notifyChannels: { telegram: boolean; email: boolean };
}) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiOnline(!!d.online))
      .catch(() => setAiOnline(false));
  }, []);

  const themeOptions = [
    { value: "light", icon: Sun, label: t.settings.themeLight },
    { value: "dark", icon: Moon, label: t.settings.themeDark },
    { value: "system", icon: Monitor, label: t.settings.themeSystem },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.settings.profile}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <UserAvatar name={user.name} className="size-14 text-lg" />
            <div className="space-y-1">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <RoleBadge role={user.role} />
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.settings.appearance}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t.settings.theme}</Label>
              <div className="flex gap-2">
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = mounted && theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary/5 text-primary"
                          : "hover:bg-accent",
                      )}
                    >
                      <Icon className="size-4.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t.settings.language}</Label>
              <LanguageToggle />
            </div>
          </CardContent>
        </Card>

        {/* AI */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.settings.ai}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t.settings.aiModel}
              </span>
              <code className="rounded bg-muted px-2 py-0.5 text-sm">{model}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t.settings.aiStatus}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium",
                  aiOnline === null
                    ? "text-muted-foreground"
                    : aiOnline
                      ? "text-success"
                      : "text-destructive",
                )}
              >
                <Circle
                  className={cn(
                    "size-2.5 fill-current",
                    aiOnline === null && "animate-pulse",
                  )}
                />
                {aiOnline === null
                  ? t.common.loading
                  : aiOnline
                    ? t.settings.aiOnline
                    : t.settings.aiOffline}
              </span>
            </div>
            {aiOnline === false && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {t.settings.aiOfflineHint}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Change password (all users) */}
        <ChangePasswordCard />

        {/* Security / 2FA (approver roles only) */}
        {totp.eligible && <TotpManager enabled={totp.enabled} />}

        {/* Notifications / integrations (admins only) */}
        {canManage && <NotificationsCard channels={notifyChannels} />}

        {/* Setup wizard (admins only) */}
        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="size-4.5 text-primary" />
                {t.onboarding.launch}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t.onboarding.launchHint}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/onboarding">
                  {t.onboarding.bannerCta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Team */}
        {canManage ? (
          <TeamManager members={team} currentUserId={currentUserId} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.settings.team}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {team.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                >
                  <UserAvatar name={m.name} image={m.avatar} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {m.weeklyCapacityHours}s
                    </span>
                    <RoleBadge role={m.role} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
