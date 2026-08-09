"use client";

import Link from "next/link";
import { Bell, AlertTriangle, CalendarClock, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/components/providers/i18n-provider";
import type { DigestDTO } from "@/lib/types";

export type NotificationItem = {
  id: string;
  title: string;
  agent: string;
};

function DigestRow({
  icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href: string;
  tone: "warning" | "danger" | "muted";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
    >
      <span className={toneClass}>{icon}</span>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

export function Notifications({
  count,
  items,
  digest,
}: {
  count: number;
  items: NotificationItem[];
  digest: DigestDTO;
}) {
  const { t } = useI18n();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t.topbar.notifications}
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-warning-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">{t.topbar.notifications}</span>
          <span className="text-xs text-muted-foreground">
            {count} {t.topbar.pendingApprovals.toLowerCase()}
          </span>
        </div>

        {/* Daily digest */}
        <div className="border-b px-2 py-2">
          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
            {t.topbar.digest}
          </p>
          <DigestRow
            icon={<AlertTriangle className="size-4" />}
            label={t.dashboard.overdue}
            value={digest.overdue}
            href="/board"
            tone={digest.overdue > 0 ? "danger" : "muted"}
          />
          <DigestRow
            icon={<CalendarClock className="size-4" />}
            label={t.dashboard.dueToday}
            value={digest.dueToday}
            href="/board"
            tone={digest.dueToday > 0 ? "warning" : "muted"}
          />
          <DigestRow
            icon={<Gauge className="size-4" />}
            label={t.topbar.overCapacity}
            value={digest.overCapacity.length}
            href="/reports"
            tone={digest.overCapacity.length > 0 ? "warning" : "muted"}
          />
        </div>

        <div className="max-h-56 overflow-y-auto thin-scrollbar">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t.topbar.noNotifications}
            </p>
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                href="/approvals"
                className="block border-b px-4 py-3 last:border-0 hover:bg-accent"
              >
                <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.agent}
                </p>
              </Link>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/approvals">{t.approvals.title}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
