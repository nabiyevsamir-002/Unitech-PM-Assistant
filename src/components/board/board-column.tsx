"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";

const COLUMN_ACCENT: Record<string, string> = {
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-progress",
  REVIEW: "bg-status-review",
  DONE: "bg-status-done",
};

export function BoardColumn({
  status,
  count,
  children,
  onAdd,
}: {
  status: string;
  count: number;
  children: React.ReactNode;
  onAdd?: () => void;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex min-w-[280px] flex-1 flex-col rounded-xl bg-muted/40">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("size-2.5 rounded-full", COLUMN_ACCENT[status])} />
        <span className="text-sm font-semibold">
          {(t.status as Record<string, string>)[status]}
        </span>
        <span className="rounded-full bg-background px-2 text-xs font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            aria-label={t.board.addTask}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto thin-scrollbar rounded-lg p-2 transition-colors",
          isOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset",
        )}
      >
        {children}
        {count === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t.board.empty}
          </p>
        )}
      </div>
    </div>
  );
}
