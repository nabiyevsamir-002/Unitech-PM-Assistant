import { prisma } from "@/lib/prisma";
import { isOverdue, isDueToday, todayBakuISO } from "@/lib/format";
import { detectAnomalies } from "@/lib/excel/analyze";
import type { ParsedTask } from "@/lib/excel/types";

// Cap the long open-task dump so the grounding snapshot stays small enough to
// fit the model's context window (num_ctx) and keep prompt-eval fast on CPU.
const MAX_OPEN_TASKS_LISTED = 40;

export type AiContext = {
  snapshot: string;
  users: { id: string; name: string; role: string }[];
  tasks: { id: string; title: string; projectName: string }[];
  projects: { id: string; name: string }[];
};

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

// Excel import stashes the columns that aren't first-class DB fields in
// Task.customFields (JSON): both budgets, actual hours, hourly rate, secondary
// assignee, dependency + all four dates. Parse them defensively.
type TaskExtras = {
  sourceId?: string | null;
  assigneeName?: string | null;
  assignee2Name?: string | null;
  dependsOn?: string | null;
  actualHours?: number | null;
  hourlyRate?: number | null;
  budget?: number | null;
  initialBudget?: number | null;
  expectedStart?: string | null;
  actualStart?: string | null;
  expectedEnd?: string | null;
  actualEnd?: string | null;
};
function parseExtras(s: unknown): TaskExtras {
  if (typeof s !== "string" || !s) return {};
  try {
    return JSON.parse(s) as TaskExtras;
  } catch {
    return {};
  }
}
function num(v: number | null | undefined): string {
  return v == null ? "—" : String(v);
}

/**
 * Builds a compact ENGLISH snapshot of live project data for the model to
 * reason over (grounding), plus raw id lists so tools can resolve names → ids.
 * All date/overdue math is computed here in code, never by the LLM.
 */
export async function buildAiContext(): Promise<AiContext> {
  const [projects, tasks, users] = await Promise.all([
    prisma.project.findMany({ include: { client: true } }),
    prisma.task.findMany({ include: { assignee: true, project: true } }),
    prisma.user.findMany({
      where: { isActive: true },
      include: {
        assignedTasks: {
          where: { status: { not: "DONE" } },
          select: { estimatedHours: true },
        },
      },
    }),
  ]);

  const overdue = tasks.filter((t) => t.status !== "DONE" && isOverdue(t.dueDate));
  const dueToday = tasks.filter((t) => t.status !== "DONE" && isDueToday(t.dueDate));

  const extrasOf = (t: (typeof tasks)[number]) => parseExtras(t.customFields);
  const assigneeOf = (t: (typeof tasks)[number]) =>
    t.assignee?.name ?? extrasOf(t).assigneeName ?? "unassigned";

  const lines: string[] = [];
  lines.push(`=== CURRENT PROJECT DATA (today is ${todayBakuISO()}, Baku time) ===`);
  lines.push(
    "NOTE: each project is separate — when the user names ONE project, use only that project's tasks.",
  );

  lines.push("\nPROJECTS:");
  for (const p of projects) {
    const own = tasks.filter((t) => t.projectId === p.id);
    const done = own.filter((t) => t.status === "DONE").length;
    const cur = p.currency ?? "AZN";
    const updBudget = own.reduce((s, t) => s + (extrasOf(t).budget ?? 0), 0);
    const initBudget = own.reduce(
      (s, t) => s + (extrasOf(t).initialBudget ?? extrasOf(t).budget ?? 0),
      0,
    );
    // "Spent" budget = money committed to tasks already started (done or in-progress).
    const budgetSpent = own
      .filter((t) => t.status === "DONE" || t.status === "IN_PROGRESS")
      .reduce((s, t) => s + (extrasOf(t).budget ?? 0), 0);
    const estH = own.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const actH = own.reduce((s, t) => s + (extrasOf(t).actualHours ?? 0), 0);
    const extra: string[] = [];
    if (updBudget > 0) {
      const initNote = initBudget !== updBudget ? `initial=${initBudget}, updated=${updBudget}` : `total=${updBudget}`;
      extra.push(
        `budget in ${cur} (money): ${initNote}, spent(started tasks)=${budgetSpent}, remaining=${updBudget - budgetSpent}`,
      );
    }
    if (estH > 0 || actH > 0) extra.push(`hours (time): estimated=${estH}, actual=${actH}`);
    lines.push(
      `- "${p.name}" [${p.status}] client=${p.client?.name ?? "internal"} due=${iso(p.dueDate)} tasks=${done}/${own.length} done${extra.length ? " | " + extra.join(" | ") : ""}`,
    );
  }

  lines.push("\nOVERDUE TASKS (not done, past due):");
  if (overdue.length === 0) lines.push("- none");
  for (const t of overdue) {
    lines.push(
      `- "${t.title}" project="${t.project.name}" assignee=${assigneeOf(t)} priority=${t.priority} due=${iso(t.dueDate)}`,
    );
  }

  lines.push("\nDUE TODAY:");
  if (dueToday.length === 0) lines.push("- none");
  for (const t of dueToday) {
    lines.push(`- "${t.title}" assignee=${assigneeOf(t)}`);
  }

  const overHours = tasks.filter((t) => {
    const a = extrasOf(t).actualHours;
    return a != null && t.estimatedHours != null && a > t.estimatedHours;
  });
  lines.push("\nTASKS OVER ESTIMATED HOURS (actual > estimated):");
  if (overHours.length === 0) lines.push("- none");
  for (const t of overHours) {
    lines.push(
      `- "${t.title}" estimated=${num(t.estimatedHours)}h actual=${num(extrasOf(t).actualHours)}h assignee=${assigneeOf(t)}`,
    );
  }

  // Date / dependency anomalies, per project — reuses the same verified detector
  // as the Excel one-shot analysis (reconstructs a ParsedTask from stored fields).
  const anomalyLines: string[] = [];
  for (const p of projects) {
    const own = tasks.filter((t) => t.projectId === p.id);
    const parsed: ParsedTask[] = own.map((t) => {
      const x = extrasOf(t);
      return {
        index: 0,
        id: x.sourceId ?? "",
        subId: "",
        title: t.title,
        assignee: assigneeOf(t),
        assignee2: x.assignee2Name ?? "",
        dependsOn: x.dependsOn ?? "",
        status: t.status,
        priority: t.priority,
        start: x.actualStart ?? x.expectedStart ?? null,
        end: x.expectedEnd ?? iso2(t.dueDate),
        expectedStart: x.expectedStart ?? null,
        actualStart: x.actualStart ?? null,
        expectedEnd: x.expectedEnd ?? iso2(t.dueDate),
        actualEnd: x.actualEnd ?? null,
        hours: t.estimatedHours ?? null,
        actualHours: x.actualHours ?? null,
        hourlyRate: x.hourlyRate ?? null,
        budget: x.budget ?? null,
        initialBudget: x.initialBudget ?? null,
        note: "",
      };
    });
    for (const a of detectAnomalies(parsed)) anomalyLines.push(`- (${p.name}) ${a}`);
  }
  lines.push("\nDATE / DEPENDENCY ANOMALIES (early/late start, dependency violations):");
  if (anomalyLines.length === 0) lines.push("- none detected");
  else lines.push(...anomalyLines);

  lines.push("\nTEAM WORKLOAD (assigned open-task hours vs weekly capacity):");
  for (const u of users) {
    const assigned = u.assignedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const flag = assigned > u.weeklyCapacityHours ? " OVER-CAPACITY" : "";
    lines.push(
      `- ${u.name} (${u.role}): ${assigned}h / ${u.weeklyCapacityHours}h, ${u.assignedTasks.length} open tasks${flag}`,
    );
  }

  // Combined workload: estimated hours + task counts across BOTH the primary and
  // secondary assignee, over every task (so "who works the most" is complete).
  type Load = { hours: number; primary: number; secondary: number };
  const load = new Map<string, Load>();
  const bump = (name: string, hours: number, role: "primary" | "secondary") => {
    const n = (name ?? "").trim();
    if (!n || n === "unassigned") return;
    const e = load.get(n) ?? { hours: 0, primary: 0, secondary: 0 };
    e.hours += hours;
    if (role === "primary") e.primary += 1;
    else e.secondary += 1;
    load.set(n, e);
  };
  for (const t of tasks) {
    const h = t.estimatedHours ?? 0;
    bump(assigneeOf(t), h, "primary");
    bump(extrasOf(t).assignee2Name ?? "", h, "secondary");
  }
  const ranked = [...load.entries()].sort((a, b) => b[1].hours - a[1].hours);
  lines.push(
    "\nWORKLOAD BY PERSON (primary + secondary assignee COMBINED, estimated hours, every task incl. done):",
  );
  for (const [name, l] of ranked) {
    lines.push(
      `- ${name}: ${l.hours}h, ${l.primary + l.secondary} tasks (${l.primary} primary + ${l.secondary} secondary)`,
    );
  }

  lines.push(
    "\nALL OPEN TASKS (title | project | assignee(+2nd) | status | priority | dep | start exp/act | due | est/actual hrs | budget):",
  );
  const openTasks = tasks.filter((x) => x.status !== "DONE");
  for (const t of openTasks.slice(0, MAX_OPEN_TASKS_LISTED)) {
    const x = extrasOf(t);
    const sec = x.assignee2Name ? `(+${x.assignee2Name})` : "";
    const dep = x.dependsOn ? x.dependsOn : "—";
    const start = `${x.expectedStart ? x.expectedStart.slice(0, 10) : "—"}/${x.actualStart ? x.actualStart.slice(0, 10) : "—"}`;
    lines.push(
      `- ${t.title} | ${t.project.name} | ${assigneeOf(t)}${sec} | ${t.status} | ${t.priority} | dep:${dep} | ${start} | ${iso(t.dueDate)} | ${num(t.estimatedHours)}/${num(x.actualHours)}h | ${num(x.budget)}`,
    );
  }
  if (openTasks.length > MAX_OPEN_TASKS_LISTED) {
    lines.push(`- (+${openTasks.length - MAX_OPEN_TASKS_LISTED} more open tasks not listed)`);
  }

  return {
    snapshot: lines.join("\n"),
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, projectName: t.project.name })),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
  };
}

function iso2(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
