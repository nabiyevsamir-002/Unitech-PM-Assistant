"use client";

import { useTransition } from "react";
import { Bell, Send, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { sendTestNotificationAction } from "@/app/actions/notify";

function ChannelRow({ label, on }: { label: string; on: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium",
          on ? "text-success" : "text-muted-foreground",
        )}
      >
        {on ? <CheckCircle2 className="size-4" /> : <Circle className="size-3" />}
        {on ? t.settings.telegramConfigured : t.settings.telegramNotConfigured}
      </span>
    </div>
  );
}

export function NotificationsCard({
  channels,
}: {
  channels: { telegram: boolean; email: boolean };
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const any = channels.telegram || channels.email;

  const sendTest = () =>
    startTransition(async () => {
      const res = await sendTestNotificationAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4.5 text-primary" />
          {t.settings.notifications}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t.settings.notificationsDesc}
        </p>
        <ChannelRow label="Telegram" on={channels.telegram} />
        <ChannelRow label={t.settings.email} on={channels.email} />
        {any ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={sendTest}
          >
            <Send className="size-4" />
            {t.settings.sendTest}
          </Button>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t.settings.telegramHint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
