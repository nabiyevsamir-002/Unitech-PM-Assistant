"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApprove } from "@/lib/constants";
import {
  CREATE_ACTIONS,
  TASK_UPDATE_ACTIONS,
  parseEntity,
} from "@/lib/audit";

type Result = { ok: boolean; message: string };

async function requireReverter() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, message: "Sessiya bitib. Yenidən daxil olun." };
  if (!canApprove(session.user.role)) {
    return { ok: false as const, message: "Dəyişikliyi geri qaytarmaq icazəniz yoxdur." };
  }
  return { ok: true as const, session };
}

/** Builds a Prisma task update payload from a (possibly partial) before-snapshot. */
function taskDataFromBefore(before: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if ("title" in before) data.title = String(before.title ?? "");
  if ("description" in before) data.description = before.description == null ? null : String(before.description);
  if ("status" in before) data.status = String(before.status);
  if ("priority" in before) data.priority = String(before.priority);
  if ("assigneeId" in before)
    data.assigneeId = before.assigneeId ? String(before.assigneeId) : null;
  if ("startDate" in before)
    data.startDate = before.startDate ? new Date(String(before.startDate)) : null;
  if ("dueDate" in before)
    data.dueDate = before.dueDate ? new Date(String(before.dueDate)) : null;
  if ("estimatedHours" in before)
    data.estimatedHours = before.estimatedHours == null ? null : Number(before.estimatedHours);
  if ("dependsOnTaskIds" in before && Array.isArray(before.dependsOnTaskIds))
    data.dependsOnTaskIds = JSON.stringify(before.dependsOnTaskIds);
  return data;
}

function revalidateAll() {
  revalidatePath("/activity");
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath("/timeline");
}

/**
 * Undoes the effect of a single audit-log entry.
 *  - create actions → delete the created entity
 *  - task update-family → restore the task's `before` field values
 * Records its own audit entry so the revert is itself traceable. PM+ only.
 */
export async function revertChange(auditId: string): Promise<Result> {
  const guard = await requireReverter();
  if (!guard.ok) return guard;

  const entry = await prisma.auditLog.findUnique({ where: { id: auditId } });
  if (!entry) return { ok: false, message: "Qeyd tapılmadı." };

  const { type, id } = parseEntity(entry.entity);
  const isCreate = (CREATE_ACTIONS as readonly string[]).includes(entry.action);
  const isTaskUpdate = (TASK_UPDATE_ACTIONS as readonly string[]).includes(entry.action);

  if (!isCreate && !isTaskUpdate) {
    return { ok: false, message: "Bu dəyişiklik geri qaytarıla bilməz." };
  }

  try {
    // --- Create actions: undo by deleting what was created ---
    if (isCreate) {
      if (type === "task") {
        const task = await prisma.task.findUnique({ where: { id } });
        if (!task) return { ok: false, message: "Tapşırıq artıq mövcud deyil." };
        await prisma.task.delete({ where: { id } });
      } else if (type === "project") {
        const project = await prisma.project.findUnique({ where: { id } });
        if (!project) return { ok: false, message: "Layihə artıq mövcud deyil." };
        await prisma.project.delete({ where: { id } }); // cascades tasks
      } else {
        return { ok: false, message: "Bu dəyişiklik geri qaytarıla bilməz." };
      }

      await prisma.auditLog.create({
        data: {
          actor: `user:${guard.session.user.id}`,
          action: "REVERTED",
          entity: entry.entity,
          // Show the reversal: what it was → what it became (nothing, for a create).
          before: entry.after,
          after: entry.before,
        },
      });
      revalidateAll();
      return { ok: true, message: "Dəyişiklik geri qaytarıldı (yaradılan element silindi)." };
    }

    // --- Task update-family: restore the before snapshot ---
    if (type !== "task") {
      return { ok: false, message: "Bu dəyişiklik geri qaytarıla bilməz." };
    }
    const before = entry.before ? (JSON.parse(entry.before) as Record<string, unknown>) : null;
    if (!before) return { ok: false, message: "Əvvəlki vəziyyət qeyd olunmayıb." };

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return { ok: false, message: "Tapşırıq artıq mövcud deyil." };

    const data = taskDataFromBefore(before);

    // Guard against restoring an assignee that has since been removed (FK).
    if (typeof data.assigneeId === "string") {
      const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
      if (!assignee) data.assigneeId = null;
    }

    await prisma.task.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "REVERTED",
        entity: entry.entity,
        // Show the reversal naturally: changed value → restored value.
        before: entry.after,
        after: entry.before,
      },
    });

    revalidateAll();
    return { ok: true, message: "Dəyişiklik geri qaytarıldı." };
  } catch {
    return { ok: false, message: "Geri qaytarma alınmadı. Bir azdan yenidən cəhd edin." };
  }
}
