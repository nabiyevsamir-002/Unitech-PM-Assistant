"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { AttachmentDTO } from "@/lib/types";

export async function listAttachments(target: {
  taskId?: string;
  projectId?: string;
}): Promise<AttachmentDTO[]> {
  const session = await auth();
  if (!session?.user) return [];
  if (!target.taskId && !target.projectId) return [];

  const rows = await prisma.attachment.findMany({
    where: target.taskId
      ? { taskId: target.taskId }
      : { projectId: target.projectId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileType: a.fileType,
    createdAt: a.createdAt.toISOString(),
  }));
}
