"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BOARD_COLUMNS } from "@/lib/constants";
import { useI18n } from "@/components/providers/i18n-provider";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue } from "@/lib/format";
import type { TaskDTO } from "@/lib/types";

const COLUMN_DOT: Record<string, string> = {
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-progress",
  REVIEW: "bg-status-review",
  DONE: "bg-status-done",
};

export function BoardPreview({ tasks }: { tasks: TaskDTO[] }) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {BOARD_COLUMNS.map((col) => {
        const colTasks = tasks
          .filter((x) => x.status === col)
          .slice(0, 4);
        const total = tasks.filter((x) => x.status === col).length;
        return (
          <div key={col} className="rounded-xl border bg-card p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <span className={cn("size-2 rounded-full", COLUMN_DOT[col])} />
              <span className="text-sm font-medium">
                {(t.status as Record<string, string>)[col]}
              </span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {total}
              </span>
            </div>
            <div className="space-y-2">
              {colTasks.map((task) => (
                <Link
                  key={task.id}
                  href="/board"
                  className="block rounded-lg border bg-background p-2.5 text-xs transition-colors hover:border-primary/40"
                >
                  <p className="line-clamp-2 font-medium">{task.title}</p>
                  <div className="mt-2 flex items-center justify-between">
                    {task.assignee ? (
                      <UserAvatar
                        name={task.assignee.name}
                        image={task.assignee.avatar}
                        className="size-5 text-[9px]"
                      />
                    ) : (
                      <span />
                    )}
                    {task.dueDate && (
                      <span
                        className={cn(
                          "text-[10px]",
                          isOverdue(task.dueDate) && task.status !== "DONE"
                            ? "font-medium text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {total === 0 && (
                <p className="py-3 text-center text-[11px] text-muted-foreground">
                  {t.board.empty}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BoardPreviewHeader() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold">{t.dashboard.boardPreview}</h2>
      <Link
        href="/board"
        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {t.dashboard.viewFullBoard}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
