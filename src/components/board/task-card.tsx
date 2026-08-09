"use client";

import { forwardRef } from "react";
import { CalendarClock, GripVertical } from "lucide-react";
import { PriorityBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue } from "@/lib/format";
import type { TaskDTO } from "@/lib/types";

type Props = {
  task: TaskDTO;
  showProject?: boolean;
  dragging?: boolean;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  style?: React.CSSProperties;
};

export const TaskCard = forwardRef<HTMLDivElement, Props>(function TaskCard(
  { task, showProject, dragging, onClick, dragHandleProps, style },
  ref,
) {
  const overdue = isOverdue(task.dueDate) && task.status !== "DONE";

  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "group relative rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow",
        dragging ? "opacity-40" : "hover:shadow-md",
      )}
    >
      {/* Drag handle */}
      <button
        {...dragHandleProps}
        className="absolute top-2 right-2 cursor-grab touch-none text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Sürüklə"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-4" />
      </button>

      <button
        onClick={onClick}
        className="block w-full text-left outline-none"
      >
        {showProject && task.projectName && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: task.projectColor ?? "var(--primary)" }}
            />
            <span className="truncate text-xs text-muted-foreground">
              {task.projectName}
            </span>
          </div>
        )}

        <p className="pr-5 leading-snug font-medium">{task.title}</p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <PriorityBadge priority={task.priority} />
          {task.dueDate && (
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                overdue ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3.5" />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {task.assignee && (
          <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
            <UserAvatar
              name={task.assignee.name}
              image={task.assignee.avatar}
              className="size-6 text-[10px]"
            />
            <span className="truncate text-xs text-muted-foreground">
              {task.assignee.name}
            </span>
          </div>
        )}
      </button>
    </div>
  );
});
