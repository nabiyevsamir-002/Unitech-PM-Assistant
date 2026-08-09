import { prisma } from "@/lib/prisma";
import {
  ApprovalDTO,
  AuditLogDTO,
  ClientDTO,
  DigestDTO,
  DocumentDTO,
  OnboardingProject,
  ProjectDTO,
  TaskDTO,
  UserDTO,
  WorkloadDTO,
} from "@/lib/types";
import {
  CREATE_ACTIONS,
  TASK_UPDATE_ACTIONS,
  parseEntity,
} from "@/lib/audit";
import {
  endOfTodayBaku,
  isDueToday,
  isOverdue,
  startOfTodayBaku,
} from "@/lib/format";
import type { Prisma } from "@prisma/client";

type TaskWithAssignee = Prisma.TaskGetPayload<{
  include: { assignee: true; project: true };
}>;

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function taskToDTO(t: TaskWithAssignee): TaskDTO {
  return {
    id: t.id,
    projectId: t.projectId,
    projectName: t.project?.name,
    projectColor: t.project?.color,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    orderIndex: t.orderIndex,
    estimatedHours: t.estimatedHours,
    loggedHours: t.loggedHours,
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, avatar: t.assignee.avatar }
      : null,
    parentTaskId: t.parentTaskId,
    dependsOnTaskIds: safeParse<string[]>(t.dependsOnTaskIds, []),
    createdAt: t.createdAt.toISOString(),
  };
}

export async function getPendingApprovalCount(): Promise<number> {
  return prisma.approval.count({ where: { status: "PENDING" } });
}

export async function getDashboardData() {
  const [
    activeProjects,
    allOpenTasks,
    pendingApprovals,
    topApproval,
    boardTasks,
  ] = await Promise.all([
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.task.findMany({
      where: { status: { not: "DONE" } },
      include: { assignee: true, project: true },
    }),
    getPendingApprovalCount(),
    prisma.approval.findFirst({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "desc" },
    }),
    prisma.task.findMany({
      include: { assignee: true, project: true },
      orderBy: [{ status: "asc" }, { orderIndex: "asc" }],
      take: 200,
    }),
  ]);

  const dueToday = allOpenTasks.filter((t) => isDueToday(t.dueDate)).length;
  const overdue = allOpenTasks.filter((t) => isOverdue(t.dueDate)).length;

  return {
    metrics: {
      activeProjects,
      dueToday,
      overdue,
      pendingApprovals,
    },
    topApproval: topApproval ? approvalToDTO(topApproval) : null,
    boardTasks: boardTasks.map(taskToDTO),
  };
}

/**
 * Live "daily digest" for the notifications bell: what a PM would want to see
 * each morning — overdue, due-today, over-capacity people, pending approvals.
 * Computed fresh on each request (the scheduled /api/ai/scan turns these into
 * proposals; this just surfaces the situation).
 */
export async function getDailyDigest(): Promise<DigestDTO> {
  const [openTasks, pendingApprovals, users] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: "DONE" } },
      select: { dueDate: true },
    }),
    getPendingApprovalCount(),
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

  const overCapacity = users
    .map((u) => ({
      name: u.name,
      assigned: u.assignedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0),
      capacity: u.weeklyCapacityHours,
    }))
    .filter((u) => u.assigned > u.capacity)
    .sort((a, b) => b.assigned - b.capacity - (a.assigned - a.capacity));

  return {
    overdue: openTasks.filter((t) => isOverdue(t.dueDate)).length,
    dueToday: openTasks.filter((t) => isDueToday(t.dueDate)).length,
    pendingApprovals,
    overCapacity,
  };
}

export async function getBoardTasks(projectId?: string): Promise<TaskDTO[]> {
  const tasks = await prisma.task.findMany({
    where: projectId ? { projectId } : undefined,
    include: { assignee: true, project: true },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  });
  return tasks.map(taskToDTO);
}

export async function getProjectsList(): Promise<ProjectDTO[]> {
  const projects = await prisma.project.findMany({
    include: {
      client: true,
      tasks: { select: { status: true } },
      excelSource: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    clientName: p.client?.name ?? null,
    startDate: p.startDate?.toISOString() ?? null,
    dueDate: p.dueDate?.toISOString() ?? null,
    currency: p.currency,
    color: p.color,
    taskCount: p.tasks.length,
    doneCount: p.tasks.filter((t) => t.status === "DONE").length,
    excelConnected: !!p.excelSource,
  }));
}

export type OnboardingState = {
  projects: OnboardingProject[];
  hasProjects: boolean;
  anyExcelConfirmed: boolean;
  memberCount: number;
  /** True when the workspace still needs first-run setup. */
  needsSetup: boolean;
};

export async function getOnboardingState(): Promise<OnboardingState> {
  const [projects, memberCount] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        excelSource: { select: { confirmed: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.count(),
  ]);

  const mapped: OnboardingProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    excelConnected: !!p.excelSource,
    excelConfirmed: p.excelSource?.confirmed ?? false,
  }));

  const anyExcelConfirmed = mapped.some((p) => p.excelConfirmed);
  return {
    projects: mapped,
    hasProjects: mapped.length > 0,
    anyExcelConfirmed,
    memberCount,
    // Setup is "needed" until an Excel source is confirmed and the team has
    // grown beyond the single seed/owner account.
    needsSetup: !anyExcelConfirmed || memberCount <= 1,
  };
}

export async function getDocuments(): Promise<DocumentDTO[]> {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    chunkCount: d._count.chunks,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function getClients(): Promise<ClientDTO[]> {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return clients;
}

export async function getProjectDetail(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      excelSource: true,
      tasks: {
        include: { assignee: true, project: true },
        orderBy: [{ orderIndex: "asc" }],
      },
    },
  });
  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    clientName: project.client?.name ?? null,
    startDate: project.startDate?.toISOString() ?? null,
    dueDate: project.dueDate?.toISOString() ?? null,
    currency: project.currency,
    color: project.color,
    excelConnected: !!project.excelSource,
    excelLocation: project.excelSource?.fileLocation ?? null,
    tasks: project.tasks.map(taskToDTO),
  };
}

export function approvalToDTO(a: {
  id: string;
  type: string;
  proposedByAgent: string;
  title: string;
  summary: string | null;
  payload: string;
  status: string;
  requestedAt: Date;
  decidedAt: Date | null;
  reason: string | null;
  decidedBy?: { name: string } | null;
}): ApprovalDTO {
  return {
    id: a.id,
    type: a.type,
    proposedByAgent: a.proposedByAgent,
    title: a.title,
    summary: a.summary,
    payload: safeParse<Record<string, unknown>>(a.payload, {}),
    status: a.status,
    requestedAt: a.requestedAt.toISOString(),
    decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
    decidedByName: a.decidedBy?.name ?? null,
    reason: a.reason,
  };
}

export async function getApprovals(status?: string): Promise<ApprovalDTO[]> {
  const approvals = await prisma.approval.findMany({
    where: status ? { status } : undefined,
    include: { decidedBy: { select: { name: true } } },
    orderBy: { requestedAt: "desc" },
  });
  return approvals.map(approvalToDTO);
}

/**
 * Rewrites a raw task snapshot into a display-friendly object: assignee ids
 * become names, dependency id arrays become a count. Dates stay ISO (the client
 * formats them). Only used for the activity UI — revert reads the raw DB entry.
 */
function humanizeSnapshot(
  obj: Record<string, unknown> | null,
  userName: Map<string, string>,
): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "assigneeId") {
      out.assignee = value ? (userName.get(String(value)) ?? "—") : null;
    } else if (key === "dependsOnTaskIds") {
      out.dependencies = Array.isArray(value) ? value.length : 0;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function getAuditLog(limit = 100): Promise<AuditLogDTO[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  // Parse snapshots once, and collect every id we need friendly names for.
  const parsed = logs.map((l) => ({
    ...parseEntity(l.entity),
    before: safeParse<Record<string, unknown> | null>(l.before, null),
    after: safeParse<Record<string, unknown> | null>(l.after, null),
  }));

  const userIds = new Set<string>();
  const taskIds = new Set<string>();
  const projectIds = new Set<string>();
  const collectAssignee = (o: Record<string, unknown> | null) => {
    const a = o?.assigneeId;
    if (typeof a === "string") userIds.add(a);
  };
  logs.forEach((l, i) => {
    if (l.actor.startsWith("user:")) userIds.add(l.actor.slice(5));
    const { type, id } = parsed[i];
    if (id && type === "task") taskIds.add(id);
    if (id && type === "project") projectIds.add(id);
    collectAssignee(parsed[i].before);
    collectAssignee(parsed[i].after);
  });

  const [users, tasks, projects] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true },
    }),
    prisma.task.findMany({
      where: { id: { in: [...taskIds] } },
      select: { id: true, title: true },
    }),
    prisma.project.findMany({
      where: { id: { in: [...projectIds] } },
      select: { id: true, name: true },
    }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return logs.map((l, i) => {
    const { type, id, before, after } = parsed[i];
    let actorKind: AuditLogDTO["actorKind"] = "system";
    let actorLabel = l.actor;
    if (l.actor.startsWith("user:")) {
      actorKind = "user";
      actorLabel = userName.get(l.actor.slice(5)) ?? "İstifadəçi";
    } else if (l.actor.startsWith("agent:")) {
      actorKind = "agent";
      actorLabel = l.actor.slice(6);
    }

    let entityTitle: string | null = null;
    if (type === "task") entityTitle = taskTitle.get(id) ?? null;
    else if (type === "project") entityTitle = projectName.get(id) ?? null;

    // Revertible when we can still act on the target:
    //  - create actions: the created entity still exists (delete it)
    //  - task update-family: the task still exists and we have a before snapshot
    let revertible = false;
    if ((CREATE_ACTIONS as readonly string[]).includes(l.action)) {
      revertible = entityTitle !== null;
    } else if ((TASK_UPDATE_ACTIONS as readonly string[]).includes(l.action)) {
      revertible = type === "task" && entityTitle !== null && before !== null;
    }

    return {
      id: l.id,
      action: l.action,
      actorKind,
      actorLabel,
      entityType: type,
      entityId: id,
      entityTitle,
      before: humanizeSnapshot(before, userName),
      after: humanizeSnapshot(after, userName),
      timestamp: l.timestamp.toISOString(),
      revertible,
    };
  });
}

export async function getTeam(): Promise<UserDTO[]> {
  // Self-registered accounts awaiting approval aren't team members yet — they
  // live in the Approvals inbox until an admin approves them.
  const users = await prisma.user.findMany({
    where: { pendingApproval: false },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    weeklyCapacityHours: u.weeklyCapacityHours,
    skills: safeParse<string[]>(u.skills, []),
    isActive: u.isActive,
    totpEnabled: u.totpEnabled,
    unavailableFrom: u.unavailableFrom
      ? u.unavailableFrom.toISOString().slice(0, 10)
      : null,
    unavailableTo: u.unavailableTo
      ? u.unavailableTo.toISOString().slice(0, 10)
      : null,
  }));
}

export async function getWorkload(): Promise<WorkloadDTO[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      assignedTasks: {
        where: { status: { not: "DONE" } },
        select: { estimatedHours: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    avatar: u.avatar,
    capacity: u.weeklyCapacityHours,
    assignedHours: u.assignedTasks.reduce(
      (sum, t) => sum + (t.estimatedHours ?? 0),
      0,
    ),
    openTasks: u.assignedTasks.length,
  }));
}

export type BillableSummary = {
  totalLogged: number;
  totalEstimated: number;
  byUser: { name: string; avatar: string | null; logged: number }[];
  byProject: {
    name: string;
    color: string | null;
    estimated: number;
    logged: number;
  }[];
};

export async function getBillableSummary(): Promise<BillableSummary> {
  const [logs, projects] = await Promise.all([
    prisma.timeLog.findMany({
      include: {
        user: { select: { name: true, avatar: true } },
        task: { select: { projectId: true } },
      },
    }),
    prisma.project.findMany({
      include: {
        tasks: { select: { estimatedHours: true, loggedHours: true } },
      },
    }),
  ]);

  const byUserMap = new Map<string, { name: string; avatar: string | null; logged: number }>();
  for (const l of logs) {
    const cur = byUserMap.get(l.userId) ?? {
      name: l.user.name,
      avatar: l.user.avatar,
      logged: 0,
    };
    cur.logged += l.hours;
    byUserMap.set(l.userId, cur);
  }

  const byProject = projects.map((p) => ({
    name: p.name,
    color: p.color,
    estimated: p.tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0),
    logged: p.tasks.reduce((s, t) => s + (t.loggedHours ?? 0), 0),
  }));

  return {
    totalLogged: logs.reduce((s, l) => s + l.hours, 0),
    totalEstimated: byProject.reduce((s, p) => s + p.estimated, 0),
    byUser: [...byUserMap.values()].sort((a, b) => b.logged - a.logged),
    byProject,
  };
}

// re-export for server actions / agents that need raw window boundaries
export { startOfTodayBaku, endOfTodayBaku };
