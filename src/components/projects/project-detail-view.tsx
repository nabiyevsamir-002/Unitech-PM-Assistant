"use client";

import Link from "next/link";
import {
  Building2,
  CalendarClock,
  KanbanSquare,
  FileSpreadsheet,
  ArrowLeft,
  CircleDashed,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  PriorityBadge,
} from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ExcelPanel } from "@/components/excel/excel-panel";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatDate, isOverdue } from "@/lib/format";
import { BOARD_COLUMNS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";

type ProjectDetail = {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  startDate: string | null;
  dueDate: string | null;
  currency: string;
  color: string | null;
  excelConnected: boolean;
  excelLocation: string | null;
  tasks: TaskDTO[];
};

export function ProjectDetailView({ project }: { project: ProjectDetail }) {
  const { t } = useI18n();
  const total = project.tasks.length;
  const done = project.tasks.filter((x) => x.status === "DONE").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.nav.projects}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span
              className="size-3.5 rounded-full"
              style={{ backgroundColor: project.color ?? "var(--primary)" }}
            />
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {project.clientName && (
              <span className="flex items-center gap-1.5">
                <Building2 className="size-4" />
                {project.clientName}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" />
              {formatDate(project.startDate)} — {formatDate(project.dueDate)}
            </span>
            <span className="font-medium">{project.currency}</span>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/board?project=${project.id}`}>
            <KanbanSquare className="size-4" />
            {t.nav.board}
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.projects.progress}</span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              {done}/{total} {t.projects.tasksCount}
            </p>
          </CardContent>
        </Card>
        {BOARD_COLUMNS.filter((c) => c !== "DONE").map((col) => {
          const count = project.tasks.filter((x) => x.status === col).length;
          return (
            <Card key={col}>
              <CardContent className="flex items-center justify-between p-5">
                <span className="text-sm text-muted-foreground">
                  {(t.status as Record<string, string>)[col]}
                </span>
                <span className="text-xl font-semibold tabular-nums">{count}</span>
              </CardContent>
            </Card>
          );
        }).slice(0, 2)}
      </div>

      {/* Excel integration */}
      {project.excelConnected ? (
        <ExcelPanel
          projectId={project.id}
          fileLocation={project.excelLocation}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileSpreadsheet className="size-4.5" />
            </span>
            <p className="text-sm font-medium">{t.projects.excelNotConnected}</p>
          </CardContent>
        </Card>
      )}

      {/* Tasks grouped by status */}
      <div className="space-y-5">
        <h2 className="text-base font-semibold">{t.projects.tasks}</h2>
        {BOARD_COLUMNS.map((col) => {
          const tasks = project.tasks.filter((x) => x.status === col);
          if (tasks.length === 0) return null;
          return (
            <div key={col} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CircleDashed className="size-4" />
                {(t.status as Record<string, string>)[col]} ({tasks.length})
              </div>
              <div className="overflow-hidden rounded-lg border">
                {tasks.map((task, i) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i > 0 && "border-t",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {task.title}
                    </span>
                    <PriorityBadge priority={task.priority} />
                    {task.dueDate && (
                      <span
                        className={cn(
                          "hidden text-xs sm:inline",
                          isOverdue(task.dueDate) && task.status !== "DONE"
                            ? "font-medium text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {task.assignee ? (
                      <UserAvatar
                        name={task.assignee.name}
                        image={task.assignee.avatar}
                        className="size-6 text-[10px]"
                      />
                    ) : (
                      <span className="size-6" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
