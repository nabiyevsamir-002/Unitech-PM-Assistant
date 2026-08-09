"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  FolderKanban,
  CheckCircle2,
  BarChart3,
  Settings,
  Sparkles,
  GanttChartSquare,
  History,
  BookText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";

type NavKey =
  | "dashboard"
  | "board"
  | "timeline"
  | "projects"
  | "approvals"
  | "reports"
  | "documents"
  | "activity"
  | "settings";

type NavItem = {
  href: string;
  labelKey: NavKey;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

export function SidebarNav({
  pendingCount,
  onNavigate,
}: {
  pendingCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  const items: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/board", labelKey: "board", icon: KanbanSquare },
    { href: "/timeline", labelKey: "timeline", icon: GanttChartSquare },
    { href: "/projects", labelKey: "projects", icon: FolderKanban },
    {
      href: "/approvals",
      labelKey: "approvals",
      icon: CheckCircle2,
      badge: pendingCount,
    },
    { href: "/reports", labelKey: "reports", icon: BarChart3 },
    { href: "/documents", labelKey: "documents", icon: BookText },
    { href: "/activity", labelKey: "activity", icon: History },
    { href: "/settings", labelKey: "settings", icon: Settings },
  ];

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4.5 shrink-0" />
            <span className="flex-1">{t.nav[item.labelKey]}</span>
            {item.badge ? (
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  active
                    ? "bg-sidebar-primary-foreground text-sidebar-primary"
                    : "bg-warning text-warning-foreground",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarBrand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Sparkles className="size-5" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">{t.common.appName}</div>
        <div className="text-[11px] text-muted-foreground">
          {t.common.appTagline}
        </div>
      </div>
    </div>
  );
}

export function DesktopSidebar({ pendingCount }: { pendingCount: number }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <SidebarBrand />
      <div className="mt-2 flex-1 overflow-y-auto thin-scrollbar pb-4">
        <SidebarNav pendingCount={pendingCount} />
      </div>
      <div className="border-t px-5 py-3 text-[11px] text-muted-foreground">
        UniTech Development · Lokal AI
      </div>
    </aside>
  );
}
