// Autonomous agent scans (5b). DETERMINISTIC on purpose — the decision of
// "what is at risk / who is overloaded" is computed in code (reliable, works
// offline), and each finding is turned into a PENDING approval so the
// human-in-the-loop gate still governs every actual change. Same pipeline the
// chat agents use; these just run proactively instead of on a chat request.

import { prisma } from "@/lib/prisma";
import { startOfTodayBaku, isOverdue, isCurrentlyUnavailable } from "@/lib/format";
import { notifyApprovalCreated } from "@/lib/notify";

const MS_PER_DAY = 86_400_000;
// How many days to push an overdue task's deadline out, by priority.
const DEADLINE_BUFFER: Record<string, number> = {
  URGENT: 2,
  HIGH: 3,
  MEDIUM: 5,
  LOW: 7,
};
const MAX_PER_SCAN = 4;

export type ScanResult = { created: number };
export type AgentScanSummary = {
  created: number;
  monitoring: number;
  assignment: number;
};

/**
 * Tasks already covered by a PENDING approval of this type (dedupe guard).
 * Matches on BOTH taskId and lowercased title, because some approvals (e.g.
 * seeded ones, chat proposals) key the task by title rather than id.
 */
type PendingKeys = { ids: Set<string>; titles: Set<string> };

async function pendingTaskKeys(type: string): Promise<PendingKeys> {
  const rows = await prisma.approval.findMany({
    where: { status: "PENDING", type },
    select: { payload: true },
  });
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload) as { taskId?: string; title?: string };
      if (p.taskId) ids.add(String(p.taskId));
      if (p.title) titles.add(String(p.title).toLowerCase());
    } catch {
      // ignore malformed payloads
    }
  }
  return { ids, titles };
}

function alreadyPending(keys: PendingKeys, id: string, title: string): boolean {
  return keys.ids.has(id) || keys.titles.has(title.toLowerCase());
}

/** Monitoring agent: overdue open tasks → propose pushing the deadline out. */
export async function runMonitoringScan(): Promise<ScanResult> {
  const [tasks, existing] = await Promise.all([
    prisma.task.findMany({ where: { status: { not: "DONE" } } }),
    pendingTaskKeys("CHANGE_DEADLINE"),
  ]);
  const today = startOfTodayBaku();
  const overdue = tasks
    .filter((t) => isOverdue(t.dueDate) && !alreadyPending(existing, t.id, t.title))
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

  let created = 0;
  for (const t of overdue.slice(0, MAX_PER_SCAN)) {
    const buffer = DEADLINE_BUFFER[t.priority] ?? 5;
    const newDue = new Date(today.getTime() + buffer * MS_PER_DAY);
    const title = `«${t.title}» tapşırığının bitmə tarixini uzatmaq`;
    await prisma.approval.create({
      data: {
        type: "CHANGE_DEADLINE",
        proposedByAgent: "Monitoring",
        title,
        summary: `Monitorinq agenti: tapşırıq gecikib (prioritet ${t.priority}). Bitmə tarixini ${buffer} gün irəli çəkmək təklif olunur.`,
        payload: JSON.stringify({
          entity: "task",
          taskId: t.id,
          title: t.title,
          field: "dueDate",
          from: t.dueDate ? t.dueDate.toISOString() : null,
          to: newDue.toISOString(),
        }),
        status: "PENDING",
      },
    });
    void notifyApprovalCreated({ title, agent: "Monitoring", type: "CHANGE_DEADLINE" });
    created++;
  }
  return { created };
}

/** Assignment agent: over-capacity members → propose moving a task to someone with headroom. */
export async function runAssignmentScan(): Promise<ScanResult> {
  const [users, existing] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      include: {
        assignedTasks: {
          where: { status: { not: "DONE" } },
          select: { id: true, title: true, estimatedHours: true },
        },
      },
    }),
    pendingTaskKeys("ASSIGN_TASK"),
  ]);

  const load = users.map((u) => ({
    id: u.id,
    name: u.name,
    tasks: u.assignedTasks,
    assigned: u.assignedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0),
    capacity: u.weeklyCapacityHours,
    onLeave: isCurrentlyUnavailable(u.unavailableFrom, u.unavailableTo),
  }));

  const over = load
    .filter((l) => l.assigned > l.capacity)
    .sort((a, b) => b.assigned - b.capacity - (a.assigned - a.capacity));
  // Candidates with headroom, most headroom first. Members currently on leave
  // are never proposed as a reassignment target.
  const under = load
    .filter((l) => l.assigned < l.capacity && !l.onLeave)
    .sort((a, b) => b.capacity - b.assigned - (a.capacity - a.assigned));

  let created = 0;
  for (const o of over) {
    if (created >= MAX_PER_SCAN) break;
    const movable = o.tasks.find((t) => !alreadyPending(existing, t.id, t.title));
    if (!movable) continue;
    const hours = movable.estimatedHours ?? 0;
    // Prefer a target the task actually fits into; else the one with most headroom.
    const target =
      under.find((u) => u.id !== o.id && u.assigned + hours <= u.capacity) ??
      under.find((u) => u.id !== o.id);
    if (!target) continue;

    const title = `«${movable.title}» tapşırığını ${target.name}-a təyin etmək`;
    await prisma.approval.create({
      data: {
        type: "ASSIGN_TASK",
        proposedByAgent: "Assignment",
        title,
        summary: `Təyinat agenti: ${o.name} həddindən artıq yüklüdür (${o.assigned}s / ${o.capacity}s). Balans üçün bu tapşırığı ${target.name}-a köçürmək təklif olunur.`,
        payload: JSON.stringify({
          entity: "task",
          taskId: movable.id,
          title: movable.title,
          field: "assignee",
          from: o.name,
          to: target.name,
        }),
        status: "PENDING",
      },
    });
    void notifyApprovalCreated({ title, agent: "Assignment", type: "ASSIGN_TASK" });
    existing.ids.add(movable.id);
    existing.titles.add(movable.title.toLowerCase());
    target.assigned += hours; // reflect the move so we don't overload the target
    created++;
  }
  return { created };
}

/** Runs every proactive agent scan and returns per-agent counts. */
export async function runAgentScan(): Promise<AgentScanSummary> {
  // Sequential: both read/write the approvals table; keep it simple + ordered.
  const monitoring = await runMonitoringScan();
  const assignment = await runAssignmentScan();
  return {
    created: monitoring.created + assignment.created,
    monitoring: monitoring.created,
    assignment: assignment.created,
  };
}
