"use client";

import { useState } from "react";
import { DesktopSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AiPanel } from "@/components/ai/ai-panel";
import type { NotificationItem } from "./notifications";
import type { DigestDTO } from "@/lib/types";

export function AppShell({
  pendingCount,
  notifications,
  digest,
  user,
  children,
}: {
  pendingCount: number;
  notifications: NotificationItem[];
  digest: DigestDTO;
  user: { name: string; email: string; role: string; image?: string | null };
  children: React.ReactNode;
}) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <DesktopSidebar pendingCount={pendingCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          pendingCount={pendingCount}
          notifications={notifications}
          digest={digest}
          user={user}
          onToggleAI={() => setAiOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto thin-scrollbar bg-muted/30">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
      <AiPanel open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
