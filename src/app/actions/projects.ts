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
