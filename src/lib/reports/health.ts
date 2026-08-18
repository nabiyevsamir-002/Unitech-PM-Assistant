// Project health score — a single 0-100 number per project, computed entirely
// in code (no LLM) from deterministic risk signals: overdue tasks, budget
// overruns, over-estimate hours, and dependency/date anomalies. Powers the
// dashboard, the project comparison, and (later) the notification bell.

import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/format";
import { detectAnomalies } from "@/lib/excel/analyze";
import type { ParsedTask } from "@/lib/excel/types";

type Extras = {
  sourceId?: string | null;
  dependsOn?: string | null;
  actualHours?: number | null;
  hourlyRate?: number | null;
  budget?: number | null;
  expectedStart?: string | null;
  actualStart?: string | null;
  expectedEnd?: string | null;
  actualEnd?: string | null;
};
function parseExtras(s: unknown): Extras {
  if (typeof s !== "string" || !s) return {};
  try {
    return JSON.parse(s) as Extras;
  } catch {
    return {};
  }
}

export type HealthBand = "good" | "warning" | "critical";

export type ProjectHealth = {
  projectId: string;
  name: string;
  score: number; // 0-100 (higher = healthier)
  band: HealthBand;
  taskCount: number;
  doneCount: number;
  openCount: number;
  progress: number; // % of tasks done
  overdueCount: number;
  budgetOverrunCount: number;
  overHoursCount: number;
  anomalyCount: number;
};

export function healthBand(score: number): HealthBand {
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

// Penalty weights (subtracted from 100). Capped so no single signal dominates.
const W = {
  overdue: { each: 8, cap: 40 },
  budget: { each: 12, cap: 25 },
  hours: { each: 4, cap: 12 },
  anomaly: { each: 5, cap: 15 },
};

function scoreProject(counts: {
  overdue: number;
  budget: number;
  hours: number;
  anomaly: number;
}): number {
  const penalty =
    Math.min(W.overdue.cap, counts.overdue * W.overdue.each) +
    Math.min(W.budget.cap, counts.budget * W.budget.each) +
    Math.min(W.hours.cap, counts.hours * W.hours.each) +
    Math.min(W.anomaly.cap, counts.anomaly * W.anomaly.each);
  return Math.max(0, Math.round(100 - penalty));
}

/** Health score for every project, newest-first is NOT applied (created order). */
export async function getProjectHealth(): Promise<ProjectHealth[]> {
  const projects = await prisma.project.findMany({
    include: {
      tasks: { include: { assignee: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return projects.map((p) => {
    const tasks = p.tasks;
    const taskCount = tasks.length;
    const doneCount = tasks.filter((t) => t.status === "DONE").length;
    const openCount = taskCount - doneCount;
    const overdueCount = tasks.filter(
      (t) => t.status !== "DONE" && isOverdue(t.dueDate),
    ).length;

    let budgetOverrunCount = 0;
    let overHoursCount = 0;
    for (const t of tasks) {
      const x = parseExtras(t.customFields);
      if (
        x.actualHours != null &&
        x.hourlyRate != null &&
        x.budget != null &&
        x.actualHours * x.hourlyRate > x.budget
      ) {
        budgetOverrunCount++;
      }
      if (
        x.actualHours != null &&
        t.estimatedHours != null &&
        x.actualHours > t.estimatedHours
      ) {
        overHoursCount++;
      }
    }

    // Reuse the verified anomaly detector by rebuilding ParsedTask from the DB row.
    const parsed: ParsedTask[] = tasks.map((t) => {
      const x = parseExtras(t.customFields);
      return {
        index: 0,
        sheet: "",
        id: x.sourceId ?? "",
        subId: "",
        title: t.title,
        costCenter: "",
        assignee: t.assignee?.name ?? "",
        assignee2: "",
        dependsOn: x.dependsOn ?? "",
        status: t.status,
        priority: t.priority,
        start: x.actualStart ?? x.expectedStart ?? null,
        end: x.expectedEnd ?? null,
        expectedStart: x.expectedStart ?? null,
        actualStart: x.actualStart ?? null,
        expectedEnd: x.expectedEnd ?? null,
        actualEnd: x.actualEnd ?? null,
        hours: t.estimatedHours ?? null,
        actualHours: x.actualHours ?? null,
        hourlyRate: x.hourlyRate ?? null,
        budget: x.budget ?? null,
        initialBudget: null,
        note: "",
      };
    });
    const anomalyCount = detectAnomalies(parsed).length;

    const score = scoreProject({
      overdue: overdueCount,
      budget: budgetOverrunCount,
      hours: overHoursCount,
      anomaly: anomalyCount,
    });

    return {
      projectId: p.id,
      name: p.name,
      score,
      band: healthBand(score),
      taskCount,
      doneCount,
      openCount,
      progress: taskCount ? Math.round((doneCount / taskCount) * 100) : 0,
      overdueCount,
      budgetOverrunCount,
      overHoursCount,
      anomalyCount,
    };
  });
}
