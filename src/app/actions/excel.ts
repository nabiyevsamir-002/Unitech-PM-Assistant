"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyApprovalCreated } from "@/lib/notify";
import { getCell, parseWorkbook } from "@/lib/excel/read";
import { sourceExists, loadWorkbookFrom } from "@/lib/excel/transport";
import { parseAnchors, DEFAULT_ANCHORS } from "@/lib/excel/anchors";
import {
  computeWritebackValues,
  buildWritebackPreview,
} from "@/lib/excel/writeback";
import type { ExcelModel, WritebackItem, AnchorMap } from "@/lib/excel/types";

export type SyncResult = {
  ok: boolean;
  message: string;
  model?: ExcelModel;
  anchorValues?: { field: string; label: string; sheet: string; cell: string; value: unknown }[];
};

/** Read the connected Excel file into the internal model (read-only). */
export async function syncExcel(projectId: string): Promise<SyncResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };

  const source = await prisma.excelSource.findUnique({ where: { projectId } });
  if (!source) return { ok: false, message: "Bu layihəyə Excel qoşulmayıb." };

  if (!(await sourceExists(source.fileLocation))) {
    return {
      ok: false,
      message: "Excel faylı tapılmadı. Fayl yerini yoxlayın.",
    };
  }

  try {
    const wb = await loadWorkbookFrom(source.fileLocation);
    const model = parseWorkbook(wb);
    const anchors: AnchorMap = {
      ...DEFAULT_ANCHORS,
      ...parseAnchors(source.anchors),
    };
    const anchorValues = Object.entries(anchors).map(([field, a]) => ({
      field,
      label: a.label,
      sheet: a.sheet,
      cell: a.cell,
      value: getCell(wb, a.sheet, a.cell),
    }));

    await prisma.excelSource.update({
      where: { projectId },
      data: { lastSyncedAt: new Date() },
    });

    return { ok: true, message: "Excel oxundu.", model, anchorValues };
  } catch {
    return {
      ok: false,
      message: "Excel oxunarkən xəta baş verdi. Fayl açıq ola bilər.",
    };
  }
}

export type WritebackProposal = {
  ok: boolean;
  message: string;
  preview?: WritebackItem[];
  approvalId?: string;
};

/**
 * Computes the app-owned values, builds a dry-run diff, and creates an
 * EXCEL_WRITE approval. Nothing is written until a human approves it.
 */
export async function proposeExcelWriteback(
  projectId: string,
): Promise<WritebackProposal> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };

  const [project, source] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: { select: { status: true, dueDate: true } } },
    }),
    prisma.excelSource.findUnique({ where: { projectId } }),
  ]);
  if (!project || !source) {
    return { ok: false, message: "Layihə və ya Excel mənbəyi tapılmadı." };
  }

  if (!(await sourceExists(source.fileLocation))) {
    return { ok: false, message: "Excel faylı tapılmadı." };
  }

  const anchors: AnchorMap = { ...DEFAULT_ANCHORS, ...parseAnchors(source.anchors) };
  const values = computeWritebackValues(
    project.status,
    project.tasks.map((t) => ({
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    })),
  );

  let preview: WritebackItem[];
  try {
    preview = await buildWritebackPreview(source.fileLocation, anchors, values);
  } catch {
    return { ok: false, message: "Excel oxunarkən xəta baş verdi." };
  }

  const changed = preview.filter((p) => p.changed);
  if (changed.length === 0) {
    return { ok: true, message: "Excel artıq güncəldir — dəyişiklik yoxdur." };
  }

  const approval = await prisma.approval.create({
    data: {
      type: "EXCEL_WRITE",
      proposedByAgent: "Data",
      title: `«${project.name}» üçün Excel geri-yazma (${changed.length} xana)`,
      summary:
        "Data agenti hesablanmış dəyərləri anchored xanalara yazmağı təklif edir. Yazmadan əvvəl fayl ehtiyat nüsxələnəcək.",
      payload: JSON.stringify({
        projectId,
        fileLocation: source.fileLocation,
        anchors,
        values,
        preview,
      }),
      status: "PENDING",
    },
  });
  void notifyApprovalCreated({
    title: approval.title,
    agent: approval.proposedByAgent,
    type: approval.type,
  });

  revalidatePath("/approvals");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `${changed.length} xana üçün təsdiq təklifi yaradıldı.`,
    preview,
    approvalId: approval.id,
  };
}
