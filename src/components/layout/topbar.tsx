"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { Notifications, type NotificationItem } from "./notifications";
import { UserMenu } from "./user-menu";
import { SidebarBrand, SidebarNav } from "./sidebar";
import { useI18n } from "@/components/providers/i18n-provider";
import type { DigestDTO } from "@/lib/types";

export function Topbar({
  pendingCount,
  notifications,
  digest,
  user,
  onToggleAI,
}: {
  pendingCount: number;
  notifications: NotificationItem[];
  digest: DigestDTO;
  user: { name: string; email: string; role: string; image?: string | null };
  onToggleAI: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/projects?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
      {/* Mobile nav */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">{t.common.appName}</SheetTitle>
          <SidebarBrand />
          <div className="mt-2">
            <SidebarNav
              pendingCount={pendingCount}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Search */}
      <form onSubmit={onSearch} className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.topbar.searchPlaceholder}
          className="pl-9"
        />
      </form>

      <div className="flex-1 sm:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleAI}
          className="gap-1.5"
        >
          <Sparkles className="size-4 text-primary" />
          <span className="hidden sm:inline">{t.ai.assistant}</span>
        </Button>
        <LanguageToggle />
        <ThemeToggle />
        <Notifications
          count={pendingCount}
          items={notifications}
          digest={digest}
        />
        <UserMenu
          name={user.name}
          email={user.email}
          role={user.role}
          image={user.image}
        />
      </div>
    </header>
  );
}
