"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";
import type { Priority, TaskStatus } from "@/lib/constants";

const STATUS_STYLES: Record<string, string> = {
  TODO: "bg-status-todo/15 text-status-todo border-status-todo/30",
  IN_PROGRESS:
    "bg-status-progress/15 text-status-progress border-status-progress/30",
  REVIEW: "bg-status-review/20 text-status-review border-status-review/40",
  DONE: "bg-status-done/15 text-status-done border-status-done/30",
  ACTIVE: "bg-status-done/15 text-status-done border-status-done/30",
  ON_HOLD: "bg-status-review/20 text-status-review border-status-review/40",
  COMPLETED: "bg-status-todo/15 text-status-todo border-status-todo/30",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
  PENDING: "bg-warning/20 text-warning border-warning/40",
  APPROVED: "bg-success/15 text-success border-success/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground border-border",
  MEDIUM: "bg-status-progress/12 text-status-progress border-status-progress/25",
  HIGH: "bg-status-review/20 text-status-review border-status-review/40",
  URGENT: "bg-destructive/15 text-destructive border-destructive/30",
};

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const label =
    (t.status as Record<string, string>)[status] ?? status;
  return <Pill className={STATUS_STYLES[status]}>{label}</Pill>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useI18n();
  const label = (t.priority as Record<string, string>)[priority] ?? priority;
  return (
    <Pill className={PRIORITY_STYLES[priority]}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          priority === "URGENT" && "bg-destructive",
          priority === "HIGH" && "bg-status-review",
          priority === "MEDIUM" && "bg-status-progress",
          priority === "LOW" && "bg-muted-foreground",
        )}
      />
      {label}
    </Pill>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n();
  const label = (t.role as Record<string, string>)[role] ?? role;
  return (
    <Pill className="bg-accent text-accent-foreground border-accent">
      {label}
    </Pill>
  );
}

// non-exhaustive helpers kept for type parity with constants
export type { Priority, TaskStatus };
