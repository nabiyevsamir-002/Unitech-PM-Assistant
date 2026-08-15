import { prisma } from "@/lib/prisma";
import { isOverdue, isDueToday, todayBakuISO } from "@/lib/format";

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

// Excel import stashes budget / actual hours / raw assignee name in Task.customFields
// (JSON) since they aren't first-class columns. Parse them defensively.
type TaskExtras = { assigneeName?: string | null; actualHours?: number | null; budget?: number | null };
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

  lines.push("\nPROJECTS:");
  for (const p of projects) {
    const own = tasks.filter((t) => t.projectId === p.id);
    const done = own.filter((t) => t.status === "DONE").length;
    const cur = p.currency ?? "AZN";
    const budgetTotal = own.reduce((s, t) => s + (extrasOf(t).budget ?? 0), 0);
    // "Spent" budget = money committed to tasks already started (done or in-progress).
    const budgetSpent = own
      .filter((t) => t.status === "DONE" || t.status === "IN_PROGRESS")
      .reduce((s, t) => s + (extrasOf(t).budget ?? 0), 0);
    const estH = own.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const actH = own.reduce((s, t) => s + (extrasOf(t).actualHours ?? 0), 0);
    const extra: string[] = [];
    if (budgetTotal > 0)
      extra.push(
        `budget in ${cur} (money): total=${budgetTotal}, spent(started tasks)=${budgetSpent}, remaining=${budgetTotal - budgetSpent}`,
      );
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

  lines.push("\nTEAM WORKLOAD (assigned open-task hours vs weekly capacity):");
  for (const u of users) {
    const assigned = u.assignedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const flag = assigned > u.weeklyCapacityHours ? " OVER-CAPACITY" : "";
    lines.push(
      `- ${u.name} (${u.role}): ${assigned}h / ${u.weeklyCapacityHours}h, ${u.assignedTasks.length} open tasks${flag}`,
    );
  }

  // Per-person totals across EVERY task (incl. completed and unregistered
  // assignees), so "how many tasks does X have" counts done ones too.
  const byAssignee = new Map<string, { total: number; open: number; done: number }>();
  for (const t of tasks) {
    const name = assigneeOf(t);
    const e = byAssignee.get(name) ?? { total: 0, open: 0, done: 0 };
    e.total += 1;
    if (t.status === "DONE") e.done += 1;
    else e.open += 1;
    byAssignee.set(name, e);
  }
  lines.push("\nTASKS PER ASSIGNEE (every task incl. completed — total / open / done):");
  for (const [name, c] of byAssignee) {
    lines.push(`- ${name}: ${c.total} total (${c.open} open, ${c.done} done)`);
  }

  lines.push(
    "\nALL OPEN TASKS (title | project | assignee | status | priority | due | est/actual hrs | budget):",
  );
  const openTasks = tasks.filter((x) => x.status !== "DONE");
  for (const t of openTasks.slice(0, MAX_OPEN_TASKS_LISTED)) {
    const x = extrasOf(t);
    lines.push(
      `- ${t.title} | ${t.project.name} | ${assigneeOf(t)} | ${t.status} | ${t.priority} | ${iso(t.dueDate)} | ${num(t.estimatedHours)}/${num(x.actualHours)}h | ${num(x.budget)}`,
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
