"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { TimeLogDTO } from "@/lib/types";

type Result = { ok: boolean; message: string };

async function recomputeLogged(taskId: string) {
  const agg = await prisma.timeLog.aggregate({
    where: { taskId },
    _sum: { hours: true },
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { loggedHours: agg._sum.hours ?? 0 },
  });
}

const logInput = z.object({
  taskId: z.string().min(1),
  hours: z.number().positive().max(1000),
  date: z.string().optional(),
  note: z.string().optional().nullable(),
});

export async function logTime(input: z.input<typeof logInput>): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  const decider = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!decider) return { ok: false, message: "Sessiya etibarsızdır. Yenidən daxil olun." };

  const parsed = logInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Saat düzgün deyil." };
  }

  await prisma.timeLog.create({
    data: {
      taskId: parsed.data.taskId,
      userId: decider.id,
      hours: parsed.data.hours,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      note: parsed.data.note ?? null,
    },
  });
  await recomputeLogged(parsed.data.taskId);
  revalidatePath("/reports");
  return { ok: true, message: "Vaxt qeyd olundu." };
}

export async function deleteTimeLog(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  const log = await prisma.timeLog.findUnique({ where: { id } });
  if (!log) return { ok: false, message: "Qeyd tapılmadı." };
  await prisma.timeLog.delete({ where: { id } });
  await recomputeLogged(log.taskId);
  revalidatePath("/reports");
  return { ok: true, message: "Qeyd silindi." };
}

export async function listTimeLogs(taskId: string): Promise<TimeLogDTO[]> {
  const session = await auth();
  if (!session?.user) return [];
  const rows = await prisma.timeLog.findMany({
    where: { taskId },
    include: { user: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    hours: r.hours,
    date: r.date.toISOString(),
    note: r.note,
    userName: r.user.name,
  }));
}
