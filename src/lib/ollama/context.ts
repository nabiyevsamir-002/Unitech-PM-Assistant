import { prisma } from "@/lib/prisma";
import { isOverdue, isDueToday } from "@/lib/format";

export type AiContext = {
  snapshot: string;
  users: { id: string; name: string; role: string }[];
  tasks: { id: string; title: string; projectName: string }[];
  projects: { id: string; name: string }[];
};

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
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

  const lines: string[] = [];
  lines.push("=== CURRENT PROJECT DATA (today is 2026-08-06, Baku time) ===");

  lines.push("\nPROJECTS:");
  for (const p of projects) {
    const total = tasks.filter((t) => t.projectId === p.id).length;
    const done = tasks.filter((t) => t.projectId === p.id && t.status === "DONE").length;
    lines.push(
      `- "${p.name}" [${p.status}] client=${p.client?.name ?? "internal"} due=${iso(p.dueDate)} tasks=${done}/${total} done`,
    );
  }

  lines.push("\nOVERDUE TASKS (not done, past due):");
  if (overdue.length === 0) lines.push("- none");
  for (const t of overdue) {
    lines.push(
      `- "${t.title}" project="${t.project.name}" assignee=${t.assignee?.name ?? "unassigned"} priority=${t.priority} due=${iso(t.dueDate)}`,
    );
  }

  lines.push("\nDUE TODAY:");
  if (dueToday.length === 0) lines.push("- none");
  for (const t of dueToday) {
    lines.push(`- "${t.title}" assignee=${t.assignee?.name ?? "unassigned"}`);
  }

  lines.push("\nTEAM WORKLOAD (assigned open-task hours vs weekly capacity):");
  for (const u of users) {
    const assigned = u.assignedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
    const flag = assigned > u.weeklyCapacityHours ? " OVER-CAPACITY" : "";
    lines.push(
      `- ${u.name} (${u.role}): ${assigned}h / ${u.weeklyCapacityHours}h, ${u.assignedTasks.length} open tasks${flag}`,
    );
  }

  lines.push("\nALL OPEN TASKS (title | project | assignee | status | due):");
  for (const t of tasks.filter((x) => x.status !== "DONE")) {
    lines.push(
      `- ${t.title} | ${t.project.name} | ${t.assignee?.name ?? "unassigned"} | ${t.status} | ${iso(t.dueDate)}`,
    );
  }

  return {
    snapshot: lines.join("\n"),
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, projectName: t.project.name })),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
  };
}
