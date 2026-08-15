"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApprove, CURRENCIES } from "@/lib/constants";
import { getTemplate } from "@/lib/templates";

type Result = { ok: boolean; message: string; projectId?: string };

const MS_PER_DAY = 86_400_000;

/** Adds whole days using UTC-ms arithmetic to avoid local-tz / DST drift. */
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MS_PER_DAY);
}

async function requireCreator() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, message: "Sessiya bitib. Yenidən daxil olun." };
  if (!canApprove(session.user.role)) {
    return { ok: false as const, message: "Layihə yaratmaq icazəniz yoxdur." };
  }
  return { ok: true as const, session };
}

/**
 * Lightweight project list for the AI panel's "focus" picker (id + name only).
 * Any signed-in user may read it; returns newest-first. Empty when unauthenticated.
 */
export async function listProjectsForAi(): Promise<{ id: string; name: string }[]> {
  const session = await auth();
  if (!session?.user) return [];
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
}

function revalidateProjectViews() {
  revalidatePath("/projects");
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/timeline");
}

const createInput = z.object({
  name: z.string().min(1, "Layihə adı boş ola bilməz"),
  clientId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  currency: z.enum(CURRENCIES).default("AZN"),
  color: z.string().optional().nullable(),
});

/** Creates a blank project (no tasks). PM+ only. */
export async function createProject(
  input: z.input<typeof createInput>,
): Promise<Result> {
  const guard = await requireCreator();
  if (!guard.ok) return guard;

  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Məlumat düzgün deyil." };
  }
  const data = parsed.data;

  try {
    const project = await prisma.project.create({
      data: {
        name: data.name.trim(),
        clientId: data.clientId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        currency: data.currency,
        color: data.color || null,
        status: "ACTIVE",
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "PROJECT_CREATED",
        entity: `project:${project.id}`,
        after: JSON.stringify({ name: project.name, template: null }),
      },
    });

    revalidateProjectViews();
    return { ok: true, message: "Layihə yaradıldı.", projectId: project.id };
  } catch {
    return { ok: false, message: "Nəsə düz getmədi. Bir azdan yenidən cəhd edin." };
  }
}

const fromTemplateInput = z.object({
  name: z.string().min(1, "Layihə adı boş ola bilməz"),
  clientId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
});

/**
 * Creates a project from a predefined template, materializing its tasks with
 * dates offset from the chosen start (task.startDate = start + offsetDays,
 * dueDate = taskStart + durationDays). Project dueDate = latest task due date.
 * PM+ only.
 */
export async function createProjectFromTemplate(
  templateId: string,
  input: z.input<typeof fromTemplateInput>,
): Promise<Result> {
  const guard = await requireCreator();
  if (!guard.ok) return guard;

  const template = getTemplate(templateId);
  if (!template) return { ok: false, message: "Şablon tapılmadı." };

  const parsed = fromTemplateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Məlumat düzgün deyil." };
  }
  const data = parsed.data;

  const projectStart = data.startDate ? new Date(data.startDate) : new Date();
  const taskDates = template.tasks.map((task) => {
    const start = addDays(projectStart, task.offsetDays);
    const due = addDays(start, task.durationDays);
    return { start, due };
  });
  // Project spans from its start to the latest task due date.
  const projectDue = taskDates.reduce(
    (latest, d) => (d.due > latest ? d.due : latest),
    projectStart,
  );

  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: data.name.trim(),
          clientId: data.clientId || null,
          startDate: projectStart,
          dueDate: projectDue,
          currency: template.currency,
          color: template.color,
          status: "ACTIVE",
        },
      });

      await tx.task.createMany({
        data: template.tasks.map((task, i) => ({
          projectId: created.id,
          title: task.title,
          status: "TODO",
          priority: task.priority,
          startDate: taskDates[i].start,
          dueDate: taskDates[i].due,
          estimatedHours: task.estimatedHours,
          orderIndex: i,
        })),
      });

      return created;
    });

    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "PROJECT_CREATED",
        entity: `project:${project.id}`,
        after: JSON.stringify({
          name: project.name,
          template: template.id,
          taskCount: template.tasks.length,
        }),
      },
    });

    revalidateProjectViews();
    return { ok: true, message: "Layihə şablondan yaradıldı.", projectId: project.id };
  } catch {
    return { ok: false, message: "Nəsə düz getmədi. Bir azdan yenidən cəhd edin." };
  }
}

// ---- Excel import: turn parsed rows into a real, managed project + tasks ----

// Diacritic-insensitive normalize so Azerbaijani status/priority/name words
// match reliably (JS toLowerCase mangles "İ" — normalize+strip fixes it).
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .trim();
}
function mapStatus(s: string): string {
  const n = norm(s);
  if (/(tamamlan|bitdi|hazir|done|complet|closed|gorulub)/.test(n)) return "DONE";
  if (/(icra|progress|davam|isl|gedir|basland|prosesd)/.test(n)) return "IN_PROGRESS";
  if (/(yoxlam|review|test|qa)/.test(n)) return "REVIEW";
  return "TODO";
}
function mapPriority(s: string): string {
  const n = norm(s);
  if (/(tecili|urgent|kritik)/.test(n)) return "URGENT";
  if (/(yuksek|high)/.test(n)) return "HIGH";
  if (/(asagi|low)/.test(n)) return "LOW";
  return "MEDIUM";
}
function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const importTaskSchema = z.object({
  title: z.string(),
  id: z.string().optional().default(""),
  subId: z.string().optional().default(""),
  assignee: z.string().optional().default(""),
  assignee2: z.string().optional().default(""),
  dependsOn: z.string().optional().default(""),
  status: z.string().optional().default(""),
  priority: z.string().optional().default(""),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  expectedStart: z.string().nullable().optional(),
  actualStart: z.string().nullable().optional(),
  expectedEnd: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  hours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  hourlyRate: z.number().nullable().optional(),
  budget: z.number().nullable().optional(),
  initialBudget: z.number().nullable().optional(),
  note: z.string().optional().default(""),
});
const importSchema = z.object({
  name: z.string().min(1, "Layihə adı boş ola bilməz"),
  tasks: z.array(importTaskSchema).min(1, "İdxal ediləcək tapşırıq yoxdur"),
});

/**
 * Imports a parsed Excel task list as a managed project: creates the Project
 * plus its Tasks (mapping AZ status/priority words to enums, matching assignee
 * names to existing users, best-effort dates). PM+ only.
 */
export async function importExcelProject(
  name: string,
  tasks: unknown,
): Promise<Result> {
  const guard = await requireCreator();
  if (!guard.ok) return guard;

  const parsed = importSchema.safeParse({ name, tasks });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Məlumat düzgün deyil." };
  }
  const { name: projName, tasks: rows } = parsed.data;

  // Best-effort assignee resolution by (normalized) name.
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const normUsers = users.map((u) => {
    const parts = norm(u.name).split(/\s+/).filter(Boolean);
    return { id: u.id, full: norm(u.name), parts };
  });
  // Match "Aygün M." → "Aygün Məmmədova": exact full name, else first name +
  // surname initial, else first name only. Returns null when nobody matches.
  const matchUserId = (raw: string): string | null => {
    const n = norm(raw);
    if (!n) return null;
    const exact = normUsers.find((u) => u.full === n);
    if (exact) return exact.id;
    const parts = n.replace(/\./g, " ").split(/\s+/).filter(Boolean);
    const first = parts[0];
    if (!first) return null;
    const initial = parts[1]?.[0];
    const byInitial = normUsers.find(
      (u) => u.parts[0] === first && (!initial || u.parts[1]?.[0] === initial),
    );
    if (byInitial) return byInitial.id;
    return normUsers.find((u) => u.parts[0] === first)?.id ?? null;
  };

  const taskData = rows
    .filter((r) => r.title.trim() !== "")
    .map((r, i) => {
      const rawAssignee = (r.assignee ?? "").trim();
      const rawAssignee2 = (r.assignee2 ?? "").trim();
      const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);
      return {
        title: r.title.trim(),
        status: mapStatus(r.status ?? ""),
        priority: mapPriority(r.priority ?? ""),
        assigneeId: matchUserId(rawAssignee),
        // Prefer the actual start when known, else the planned one; due = deadline.
        startDate: toDate(r.actualStart ?? r.expectedStart ?? r.start),
        dueDate: toDate(r.expectedEnd ?? r.end),
        estimatedHours: typeof r.hours === "number" ? r.hours : null,
        description: r.note?.trim() || null,
        // Columns that aren't first-class DB fields are stashed here so the AI
        // can still report them: raw assignee names, secondary assignee, actual
        // hours, both budgets, hourly rate, dependency + all four dates.
        customFields: JSON.stringify({
          sourceId: r.id || null,
          assigneeName: rawAssignee || null,
          assignee2Name: rawAssignee2 || null,
          dependsOn: r.dependsOn || null,
          actualHours: numOrNull(r.actualHours),
          hourlyRate: numOrNull(r.hourlyRate),
          budget: numOrNull(r.budget),
          initialBudget: numOrNull(r.initialBudget),
          expectedStart: r.expectedStart ?? null,
          actualStart: r.actualStart ?? null,
          expectedEnd: r.expectedEnd ?? null,
          actualEnd: r.actualEnd ?? null,
        }),
        orderIndex: i,
      };
    });

  if (taskData.length === 0) {
    return { ok: false, message: "İdxal ediləcək tapşırıq tapılmadı." };
  }

  const dues = taskData.map((t) => t.dueDate).filter((d): d is Date => !!d);
  const starts = taskData.map((t) => t.startDate).filter((d): d is Date => !!d);
  const projectDue = dues.length ? new Date(Math.max(...dues.map((d) => d.getTime()))) : null;
  const projectStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;

  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: projName.trim(),
          status: "ACTIVE",
          currency: "AZN",
          startDate: projectStart,
          dueDate: projectDue,
        },
      });
      await tx.task.createMany({
        data: taskData.map((t) => ({ ...t, projectId: created.id })),
      });
      return created;
    });

    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "PROJECT_CREATED",
        entity: `project:${project.id}`,
        after: JSON.stringify({ name: project.name, source: "excel-import", taskCount: taskData.length }),
      },
    });

    revalidateProjectViews();
    return {
      ok: true,
      message: `«${project.name}» import edildi (${taskData.length} tapşırıq).`,
      projectId: project.id,
    };
  } catch {
    return { ok: false, message: "İdxal zamanı xəta baş verdi. Bir azdan yenidən cəhd edin." };
  }
}

/** Deletes a project and everything under it (tasks, Excel link, attachments — cascade). PM+ only. */
export async function deleteProject(projectId: string): Promise<Result> {
  const guard = await requireCreator();
  if (!guard.ok) return guard;
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    if (!project) return { ok: false, message: "Layihə tapılmadı." };

    await prisma.project.delete({ where: { id: projectId } }); // cascades tasks/excel/attachments

    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "PROJECT_DELETED",
        entity: `project:${projectId}`,
        before: JSON.stringify({ name: project.name }),
      },
    });

    revalidateProjectViews();
    return { ok: true, message: `«${project.name}» silindi.` };
  } catch {
    return { ok: false, message: "Silmək mümkün olmadı. Bir azdan yenidən cəhd edin." };
  }
}

/**
 * Wipes ALL project data (projects, tasks, approvals, time logs, attachments,
 * documents, Excel links, clients) so the app starts clean. Keeps user accounts.
 * PM+ only. Irreversible.
 */
export async function clearAllData(): Promise<Result> {
  const guard = await requireCreator();
  if (!guard.ok) return guard;
  try {
    await prisma.$transaction([
      prisma.approval.deleteMany(),
      prisma.timeLog.deleteMany(),
      prisma.attachment.deleteMany(),
      prisma.documentChunk.deleteMany(),
      prisma.document.deleteMany(),
      prisma.excelSource.deleteMany(),
      prisma.task.deleteMany(),
      prisma.project.deleteMany(),
      prisma.client.deleteMany(),
    ]);

    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "DATA_CLEARED",
        entity: "all",
        after: JSON.stringify({ note: "all project data cleared, users kept" }),
      },
    });

    revalidateProjectViews();
    return { ok: true, message: "Bütün layihə datası təmizləndi." };
  } catch {
    return { ok: false, message: "Təmizləmə zamanı xəta baş verdi." };
  }
}
