"use client";

import { useMemo, useState } from "react";
import { GanttChartSquare, Target, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

const ROW_H = 40;
const LABEL_W = 240;
const ZOOM = [16, 26, 42]; // px per day: compact / normal / wide
const AXIS_H = 34;

const DAY = 24 * 60 * 60 * 1000;

const STATUS_BAR: Record<string, string> = {
  TODO: "bg-status-todo/70",
  IN_PROGRESS: "bg-status-progress/80",
  REVIEW: "bg-status-review/80",
  DONE: "bg-status-done/70",
};

function dayIndex(from: number, d: number): number {
  return Math.round((d - from) / DAY);
}

export function TimelineView({
  tasks,
  projects,
}: {
  tasks: TaskDTO[];
  projects: ProjectDTO[];
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState(""); // "" = all projects
  const [zoomIdx, setZoomIdx] = useState(1);
  const pxPerDay = ZOOM[zoomIdx];

  const dated = tasks.filter(
    (x) => (x.startDate || x.dueDate) && (!filter || x.projectId === filter),
  );
  // Projects that actually have dated tasks — the only ones worth filtering by.
  const timelineProjects = projects.filter((p) =>
    tasks.some((tk) => tk.projectId === p.id && (tk.startDate || tk.dueDate)),
  );

  const layout = useMemo(() => {
    if (dated.length === 0) return null;

    // Domain: min start → max due, padded by a few days.
    let min = Infinity;
    let max = -Infinity;
    for (const tk of dated) {
      const s = tk.startDate ? +new Date(tk.startDate) : +new Date(tk.dueDate!);
      const e = tk.dueDate ? +new Date(tk.dueDate) : +new Date(tk.startDate!);
      min = Math.min(min, s, e);
      max = Math.max(max, s, e);
    }
    // snap to the start of the day, pad a few days each side
    const minDay = new Date(min);
    minDay.setHours(0, 0, 0, 0);
    const maxDay = new Date(max);
    maxDay.setHours(0, 0, 0, 0);
    const domainStart = minDay.getTime() - 2 * DAY;
    const domainEnd = maxDay.getTime() + 3 * DAY;
    const totalDays = Math.max(1, dayIndex(domainStart, domainEnd));
    const width = totalDays * pxPerDay;

    // Ordered rows: project header + its dated tasks.
    type Row =
      | { type: "project"; name: string; color: string | null }
      | { type: "task"; task: TaskDTO };
    const rows: Row[] = [];
    const barPos = new Map<string, { top: number; left: number; right: number }>();

    const projOrder = projects.map((p) => p.id);
    const byProject = new Map<string, TaskDTO[]>();
    for (const tk of dated) {
      const arr = byProject.get(tk.projectId) ?? [];
      arr.push(tk);
      byProject.set(tk.projectId, arr);
    }

    for (const pid of projOrder) {
      const list = byProject.get(pid);
      if (!list || list.length === 0) continue;
      const proj = projects.find((p) => p.id === pid)!;
      rows.push({ type: "project", name: proj.name, color: proj.color });
      list
        .sort((a, b) => {
          const as = +new Date(a.startDate ?? a.dueDate!);
          const bs = +new Date(b.startDate ?? b.dueDate!);
          return as - bs;
        })
        .forEach((tk) => {
          const rowIndex = rows.length;
          rows.push({ type: "task", task: tk });
          const s = tk.startDate
            ? +new Date(tk.startDate)
            : +new Date(tk.dueDate!) - 2 * DAY;
          const e = tk.dueDate ? +new Date(tk.dueDate) : +new Date(tk.startDate!);
          const left = dayIndex(domainStart, s) * pxPerDay;
          const right = Math.max(left + pxPerDay, dayIndex(domainStart, e) * pxPerDay);
          barPos.set(tk.id, {
            top: rowIndex * ROW_H + ROW_H / 2,
            left,
            right,
          });
        });
    }

    // Week tick marks for the axis.
    const ticks: { x: number; label: string }[] = [];
    for (let i = 0; i <= totalDays; i++) {
      const date = new Date(domainStart + i * DAY);
      if (date.getDay() === 1 || i === 0) {
        ticks.push({
          x: i * pxPerDay,
          label: `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`,
        });
      }
    }

    const nowMs = new Date().getTime();
    const todayX = dayIndex(domainStart, new Date().setHours(0, 0, 0, 0)) * pxPerDay;

    // Dependency arrows (both endpoints must be visible).
    const arrows: { from: string; to: string }[] = [];
    for (const tk of dated) {
      for (const dep of tk.dependsOnTaskIds) {
        if (barPos.has(dep) && barPos.has(tk.id)) {
          arrows.push({ from: dep, to: tk.id });
        }
      }
    }

    return { rows, barPos, width, totalDays, ticks, todayX, arrows, nowMs };
  }, [dated, projects, pxPerDay]);

  if (!layout) {
    return (
      <div className="space-y-5">
        <Header />
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <GanttChartSquare className="mb-3 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t.timeline.noTasks}</p>
        </div>
      </div>
    );
  }

  const { rows, barPos, width, ticks, todayX, arrows, nowMs } = layout;
  const height = rows.length * ROW_H;

  return (
    <div className="space-y-5">
      <Header />

      {/* Controls: project focus + zoom */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {timelineProjects.length > 1 ? (
          <div className="flex items-center gap-2">
            <Target className="size-4 shrink-0 text-muted-foreground" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="min-w-0 max-w-64 truncate rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t.ai.allProjects}</option>
              {timelineProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
            disabled={zoomIdx === 0}
            aria-label={t.timeline.zoomOut}
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setZoomIdx((i) => Math.min(ZOOM.length - 1, i + 1))}
            disabled={zoomIdx === ZOOM.length - 1}
            aria-label={t.timeline.zoomIn}
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex">
          {/* Left label column */}
          <div
            className="shrink-0 border-r"
            style={{ width: LABEL_W }}
          >
            <div
              className="border-b bg-muted/40 px-3 text-xs font-medium text-muted-foreground"
              style={{ height: AXIS_H, lineHeight: `${AXIS_H}px` }}
            >
              {t.nav.projects}
            </div>
            {rows.map((row, i) =>
              row.type === "project" ? (
                <div
                  key={`p-${i}`}
                  className="flex items-center gap-2 border-b bg-muted/20 px-3 font-semibold"
                  style={{ height: ROW_H }}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color ?? "var(--primary)" }}
                  />
                  <span className="truncate text-sm">{row.name}</span>
                </div>
              ) : (
                <div
                  key={row.task.id}
                  className="flex items-center border-b px-3 pl-7"
                  style={{ height: ROW_H }}
                >
                  <span className="truncate text-sm">{row.task.title}</span>
                </div>
              ),
            )}
          </div>

          {/* Timeline area */}
          <div className="overflow-x-auto thin-scrollbar">
            <div className="relative" style={{ width }}>
              {/* Axis */}
              <div
                className="sticky top-0 border-b bg-muted/40"
                style={{ height: AXIS_H }}
              >
                {ticks.map((tick, i) => (
                  <div
                    key={i}
                    className="absolute top-0 flex h-full items-center border-l border-border/60 pl-1 text-[10px] text-muted-foreground"
                    style={{ left: tick.x }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>

              {/* Rows background + bars */}
              <div className="relative" style={{ height }}>
                {/* grid lines */}
                {ticks.map((tick, i) => (
                  <div
                    key={`g-${i}`}
                    className="absolute top-0 bottom-0 border-l border-border/40"
                    style={{ left: tick.x }}
                  />
                ))}

                {/* today marker */}
                {todayX >= 0 && todayX <= width && (
                  <div
                    className="absolute top-0 bottom-0 z-20 w-0.5 bg-primary/70"
                    style={{ left: todayX }}
                  >
                    <span className="absolute -top-0 left-1 rounded bg-primary px-1 text-[9px] font-medium text-primary-foreground">
                      {t.timeline.today}
                    </span>
                  </div>
                )}

                {/* dependency arrows */}
                <svg
                  className="pointer-events-none absolute inset-0 z-10"
                  width={width}
                  height={height}
                >
                  {arrows.map((a, i) => {
                    const from = barPos.get(a.from)!;
                    const to = barPos.get(a.to)!;
                    const x1 = from.right;
                    const y1 = from.top;
                    const x2 = to.left;
                    const y2 = to.top;
                    const midX = Math.max(x1 + 8, x2 - 8);
                    return (
                      <g key={i}>
                        <path
                          d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                          fill="none"
                          stroke="var(--muted-foreground)"
                          strokeWidth={1.5}
                          strokeDasharray="3 2"
                          opacity={0.6}
                        />
                        <circle cx={x2} cy={y2} r={2.5} fill="var(--muted-foreground)" />
                      </g>
                    );
                  })}
                </svg>

                {/* bars */}
                {rows.map((row, i) => {
                  if (row.type !== "task") return null;
                  const pos = barPos.get(row.task.id)!;
                  const overdue =
                    row.task.dueDate &&
                    row.task.status !== "DONE" &&
                    +new Date(row.task.dueDate) < nowMs;
                  return (
                    <div
                      key={row.task.id}
                      className="absolute border-b border-transparent"
                      style={{ top: i * ROW_H, height: ROW_H, left: 0, right: 0 }}
                    >
                      <div
                        className={cn(
                          "absolute top-1/2 h-5 -translate-y-1/2 rounded-md text-[10px] text-white",
                          STATUS_BAR[row.task.status] ?? "bg-muted-foreground/60",
                          overdue && "ring-1 ring-destructive",
                        )}
                        style={{
                          left: pos.left,
                          width: pos.right - pos.left,
                        }}
                        title={`${row.task.title} · ${formatDate(row.task.startDate)} → ${formatDate(row.task.dueDate)}`}
                      >
                        <span className="absolute inset-0 flex items-center truncate px-1.5">
                          {row.task.assignee?.name.split(" ")[0] ?? ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.timeline.title}</h1>
      <p className="text-sm text-muted-foreground">{t.timeline.subtitle}</p>
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  const items = [
    { key: "TODO", cls: "bg-status-todo/70" },
    { key: "IN_PROGRESS", cls: "bg-status-progress/80" },
    { key: "REVIEW", cls: "bg-status-review/80" },
    { key: "DONE", cls: "bg-status-done/70" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.key} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-4 rounded", it.cls)} />
          {(t.status as Record<string, string>)[it.key]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-0.5 bg-primary/70" />
        {t.timeline.today}
      </span>
    </div>
  );
}
