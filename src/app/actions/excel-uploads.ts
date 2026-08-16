"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type StoredUpload = {
  id: string;
  fileName: string;
  snapshot: string; // JSON string of the organize Result
  savedProjectId: string | null;
  createdAt: string;
};

/**
 * All previously-analyzed Excel uploads, newest first. Any signed-in user may
 * read them (uploading/analysing is likewise open to any signed-in user). These
 * are what the /excel page rebuilds its cards from after a refresh.
 */
export async function listExcelUploads(): Promise<StoredUpload[]> {
  const session = await auth();
  if (!session?.user) return [];
  const rows = await prisma.excelUpload.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      snapshot: true,
      savedProjectId: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Remove a stored upload (deleting a card). Does not touch any saved project. */
export async function deleteExcelUpload(id: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await prisma.excelUpload.deleteMany({ where: { id } });
  return { ok: true };
}

/** Link a stored upload to the project it was imported into (marks it "saved"). */
export async function markExcelUploadSaved(
  id: string,
  projectId: string,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await prisma.excelUpload.updateMany({
    where: { id },
    data: { savedProjectId: projectId },
  });
  return { ok: true };
}
