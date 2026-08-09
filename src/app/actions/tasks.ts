"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { taskSnapshot } from "@/lib/audit";

const taskInput = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1, "Başlıq boş ola bilməz"),
  description: z.string().optional().nullable(),
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  assigneeId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  dependsOnTaskIds: z.array(z.string()).optional(),
});

export type ActionResult = { ok: boolean; message: string };

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session.user;
}

function revalidateBoards() {
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
}

export async function createTask(
  input: z.input<typeof taskInput>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = taskInput.parse(input);

    const created = await prisma.task.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        estimatedHours: data.estimatedHours ?? null,
        dependsOnTaskIds: JSON.stringify(data.dependsOnTaskIds ?? []),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: `user:${user.id}`,
        action: "TASK_CREATED",
        entity: `task:${created.id}`,
        after: JSON.stringify(taskSnapshot(created)),
      },
    });

    revalidateBoards();
    revalidatePath(`/projects/${data.projectId}`);
    return { ok: true, message: "Tapşırıq yaradıldı." };
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
}

const patchInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  dependsOnTaskIds: z.array(z.string()).optional(),
});

/** Detects whether adding `deps` to `taskId` would create a dependency cycle. */
async function wouldCycle(taskId: string, deps: string[]): Promise<boolean> {
  if (deps.includes(taskId)) return true;
  const all = await prisma.task.findMany({
    select: { id: true, dependsOnTaskIds: true },
  });
  const graph = new Map<string, string[]>();
  for (const t of all) {
    try {
      graph.set(t.id, JSON.parse(t.dependsOnTaskIds) as string[]);
    } catch {
      graph.set(t.id, []);
    }
  }
  graph.set(taskId, deps);

  // DFS from taskId following dependency edges; a path back to taskId = cycle.
  const seen = new Set<string>();
  const stack = [...deps];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph.get(cur) ?? []));
  }
  return false;
}

export async function updateTask(
  id: string,
  patch: z.input<typeof patchInput>,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = patchInput.parse(patch);

    const before = await prisma.task.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "Tapşırıq tapılmadı." };

    if (data.dependsOnTaskIds !== undefined) {
      const deps = data.dependsOnTaskIds.filter((d) => d && d !== id);
      if (await wouldCycle(id, deps)) {
        return { ok: false, message: "Dövri asılılıq mümkün deyil." };
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId || null } : {}),
        ...(data.startDate !== undefined
          ? { startDate: data.startDate ? new Date(data.startDate) : null }
          : {}),
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate ? new Date(data.dueDate) : null }
          : {}),
        ...(data.estimatedHours !== undefined ? { estimatedHours: data.estimatedHours } : {}),
        ...(data.dependsOnTaskIds !== undefined
          ? {
              dependsOnTaskIds: JSON.stringify(
                data.dependsOnTaskIds.filter((d) => d && d !== id),
              ),
            }
          : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: `user:${user.id}`,
        action: "TASK_UPDATED",
        entity: `task:${id}`,
        before: JSON.stringify(taskSnapshot(before)),
        after: JSON.stringify(taskSnapshot(updated)),
      },
    });

    revalidateBoards();
    revalidatePath(`/projects/${before.projectId}`);
    return { ok: true, message: "Dəyişikliklər yadda saxlanıldı." };
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
}

/**
 * Persists a board drag: sets the moved task's status and re-indexes every
 * task in the destination column so the order survives a refresh.
 * Direct human board edits do NOT require approval (the gate is for AI actions).
 */
export async function moveTask(
  id: string,
  status: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await requireUser();
    if (!(TASK_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, message: "Yanlış status." };
    }
    await prisma.$transaction([
      prisma.task.update({ where: { id }, data: { status } }),
      ...orderedIds.map((taskId, index) =>
        prisma.task.update({ where: { id: taskId }, data: { orderIndex: index } }),
      ),
    ]);
    revalidateBoards();
    return { ok: true, message: "" };
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return { ok: false, message: "Tapşırıq tapılmadı." };
    await prisma.task.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        actor: `user:${user.id}`,
        action: "TASK_DELETED",
        entity: `task:${id}`,
        before: JSON.stringify(taskSnapshot(task)),
      },
    });
    revalidateBoards();
    revalidatePath(`/projects/${task.projectId}`);
    return { ok: true, message: "Tapşırıq silindi." };
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
}

function friendly(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues[0]?.message ?? "Məlumat düzgün deyil.";
  }
  if (e instanceof Error && e.message === "UNAUTHENTICATED") {
    return "Sessiya bitib. Yenidən daxil olun.";
  }
  return "Nəsə düz getmədi. Bir azdan yenidən cəhd edin.";
}
