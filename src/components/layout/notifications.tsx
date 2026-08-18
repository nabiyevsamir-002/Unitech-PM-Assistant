"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, CalendarClock, Gauge, ShieldAlert, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatDate } from "@/lib/format";
import { markNotificationsRead } from "@/app/actions/notifications";
import type { NotificationFeedItem } from "@/lib/notifications";
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
  feed,
  unread,
  digest,
}: {
  count: number;
  items: NotificationItem[];
  feed: NotificationFeedItem[];
  unread: number;
  digest: DigestDTO;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const markRead = () =>
    startTransition(async () => {
      await markNotificationsRead();
      router.refresh();
    });

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
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-warning-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">{t.topbar.notifications}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markRead}
              disabled={pending}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              {t.topbar.markAllRead}
            </button>
          )}
        </div>

        {/* Alert feed (persistent notifications) */}
        {feed.length > 0 && (
          <div className="max-h-52 overflow-y-auto thin-scrollbar border-b">
            {feed.map((n) => {
              const inner = (
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
                  )}
                  <ShieldAlert
                    className={n.read ? "mt-0.5 size-4 shrink-0 text-muted-foreground" : "mt-0.5 size-4 shrink-0 text-warning"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={n.read ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {formatDate(n.createdAt)}
                    </p>
                  </div>
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} className="block px-4 py-2.5 hover:bg-accent">
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className="px-4 py-2.5">
                  {inner}
                </div>
              );
            })}
          </div>
        )}

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

        {items.length > 0 && (
          <p className="px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground">
            {t.topbar.pendingApprovals} ({count})
          </p>
        )}
        <div className="max-h-56 overflow-y-auto thin-scrollbar">
          {items.length === 0 && feed.length === 0 ? (
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
