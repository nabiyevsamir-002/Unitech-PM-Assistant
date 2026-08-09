import type { Prisma } from "@prisma/client";
import { applyWriteback } from "@/lib/excel/writeback";
import type { AnchorMap, ExcelCellValue } from "@/lib/excel/types";

type Payload = Record<string, unknown>;
// Accept either the base client or an interactive-transaction client, so the
// executor can run atomically inside decideApproval's $transaction.
type Db = Prisma.TransactionClient;

function str(p: Payload, key: string): string | undefined {
  const v = p[key];
  return typeof v === "string" ? v : undefined;
}

async function findTask(db: Db, p: Payload) {
  const taskId = str(p, "taskId");
  if (taskId) {
    const t = await db.task.findUnique({ where: { id: taskId } });
    if (t) return t;
  }
  const title = str(p, "title");
  if (title) {
    return db.task.findFirst({ where: { title } });
  }
  return null;
}

async function findUserByNameOrId(db: Db, value?: string) {
  if (!value) return null;
  const byId = await db.user.findUnique({ where: { id: value } }).catch(() => null);
  if (byId) return byId;
  return db.user.findFirst({ where: { name: value } });
}

/**
 * Executes the concrete effect of an approved action and writes an audit log,
 * using the provided (transaction) client so it is atomic with the caller.
 * Returns a short human-readable (Azerbaijani) description of what happened.
 * Throws if the target can no longer be found (e.g. task deleted meanwhile).
 */
export async function executeApproval(
  db: Db,
  approval: {
    id: string;
    type: string;
    proposedByAgent: string;
    payload: string;
  },
): Promise<string> {
  let payload: Payload = {};
  try {
    payload = JSON.parse(approval.payload) as Payload;
  } catch {
    payload = {};
  }

  const audit = (action: string, entity: string, before?: unknown, after?: unknown) =>
    db.auditLog.create({
      data: {
        actor: `agent:${approval.proposedByAgent}`,
        action,
        entity,
        before: before ? JSON.stringify(before) : null,
        after: after ? JSON.stringify(after) : null,
      },
    });

  switch (approval.type) {
    case "CHANGE_DEADLINE": {
      const task = await findTask(db, payload);
      if (!task) throw new Error("Tapşırıq tapılmadı");
      const to = str(payload, "to");
      const newDue = to ? new Date(to) : null;
      await db.task.update({ where: { id: task.id }, data: { dueDate: newDue } });
      await audit("TASK_DEADLINE_CHANGED", `task:${task.id}`, { dueDate: task.dueDate }, { dueDate: newDue });
      return "Bitmə tarixi yeniləndi.";
    }

    case "ASSIGN_TASK": {
      const task = await findTask(db, payload);
      if (!task) throw new Error("Tapşırıq tapılmadı");
      const user = await findUserByNameOrId(db, str(payload, "to"));
      if (!user) throw new Error("İcraçı tapılmadı");
      await db.task.update({ where: { id: task.id }, data: { assigneeId: user.id } });
      await audit("TASK_ASSIGNED", `task:${task.id}`, { assigneeId: task.assigneeId }, { assigneeId: user.id });
      return `Tapşırıq ${user.name}-a təyin edildi.`;
    }

    case "CHANGE_STATUS": {
      const task = await findTask(db, payload);
      if (!task) throw new Error("Tapşırıq tapılmadı");
      const to = str(payload, "to") ?? "TODO";
      await db.task.update({ where: { id: task.id }, data: { status: to } });
      await audit("TASK_STATUS_CHANGED", `task:${task.id}`, { status: task.status }, { status: to });
      return "Status yeniləndi.";
    }

    case "CREATE_TASK": {
      let projectId = str(payload, "projectId");
      if (!projectId) {
        const projectName = str(payload, "projectName");
        const project = projectName
          ? await db.project.findFirst({ where: { name: projectName } })
          : await db.project.findFirst();
        projectId = project?.id;
      }
      if (!projectId) throw new Error("Layihə tapılmadı");
      const user = await findUserByNameOrId(db, str(payload, "assignee"));
      const created = await db.task.create({
        data: {
          projectId,
          title: str(payload, "title") ?? "Yeni tapşırıq",
          description: str(payload, "description") ?? null,
          status: "TODO",
          priority: str(payload, "priority") ?? "MEDIUM",
          assigneeId: user?.id ?? null,
          dueDate: str(payload, "dueDate") ? new Date(str(payload, "dueDate")!) : null,
        },
      });
      await audit("TASK_CREATED", `task:${created.id}`, null, { title: created.title });
      return "Tapşırıq yaradıldı.";
    }

    case "APPROVE_USER": {
      const userId = str(payload, "userId");
      const user = userId
        ? await db.user.findUnique({ where: { id: userId } })
        : null;
      if (!user) throw new Error("İstifadəçi tapılmadı (silinmiş ola bilər)");
      await db.user.update({
        where: { id: user.id },
        data: { isActive: true, pendingApproval: false },
      });
      await audit(
        "USER_APPROVED",
        `user:${user.id}`,
        { isActive: false, pendingApproval: true },
        { isActive: true, pendingApproval: false },
      );
      return `${user.name} təsdiqləndi — hesab aktivləşdirildi.`;
    }

    case "SEND_MESSAGE": {
      // Demo: message sending is simulated and audited (no real email is sent).
      await audit("MESSAGE_SENT", `message:${approval.id}`, null, {
        to: str(payload, "to"),
        subject: str(payload, "subject"),
      });
      return "Mesaj göndərildi (demo simulyasiyası).";
    }

    case "EXCEL_WRITE": {
      const fileLocation = str(payload, "fileLocation");
      const anchors = payload.anchors as AnchorMap | undefined;
      const values = payload.values as Record<string, ExcelCellValue> | undefined;
      if (!fileLocation || !anchors || !values) {
        throw new Error("Excel yazma məlumatı natamamdır");
      }
      // Backs up the original file first, then writes ONLY the anchored cells.
      const { backupPath, written } = await applyWriteback(fileLocation, anchors, values);
      const projectId = str(payload, "projectId");
      if (projectId) {
        await db.excelSource.updateMany({
          where: { projectId },
          data: { lastSyncedAt: new Date() },
        });
      }
      await audit("EXCEL_WRITE", `excel:${projectId ?? approval.id}`, null, {
        written,
        backupPath,
      });
      return `Excel yeniləndi (${written} xana). Ehtiyat nüsxə saxlanıldı.`;
    }

    default:
      await audit("UNKNOWN_APPROVAL_EXECUTED", `approval:${approval.id}`, null, payload);
      return "Əməliyyat icra olundu.";
  }
}
