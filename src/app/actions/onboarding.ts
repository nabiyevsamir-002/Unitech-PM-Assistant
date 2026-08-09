"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import fs from "node:fs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/constants";
import { resolveExcelPath } from "@/lib/excel/read";
import { isGraphLocation } from "@/lib/excel/transport";
import { DEFAULT_ANCHORS } from "@/lib/excel/anchors";

type Result = { ok: boolean; message: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, message: "Sessiya bitib. Yenidən daxil olun." };
  if (!canManageUsers(session.user.role)) {
    return { ok: false as const, message: "Quraşdırma icazəniz yoxdur." };
  }
  return { ok: true as const, session };
}

const connectInput = z.object({
  projectId: z.string().min(1),
  fileLocation: z.string().min(1, "Fayl yeri boş ola bilməz"),
});

/**
 * Onboarding step 1: attach an Excel source to a project. Suggests the default
 * anchor map; the source stays UNCONFIRMED until the human confirms (step 2).
 * Admin only.
 */
export async function connectExcelSource(
  input: z.input<typeof connectInput>,
): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = connectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Məlumat düzgün deyil." };
  }
  const { projectId, fileLocation } = parsed.data;

  // Local sources are validated up-front; a Graph (msgraph:) source is validated
  // later at sync time (it may be registered before Graph creds are set).
  if (!isGraphLocation(fileLocation) && !fs.existsSync(resolveExcelPath(fileLocation))) {
    return { ok: false, message: "Excel faylı tapılmadı. Fayl yerini yoxlayın." };
  }

  try {
    await prisma.excelSource.upsert({
      where: { projectId },
      create: {
        projectId,
        fileLocation,
        anchors: JSON.stringify(DEFAULT_ANCHORS),
        confirmed: false,
      },
      // Re-connecting only updates the path; a prior confirmation is preserved.
      update: { fileLocation },
    });
    await prisma.auditLog.create({
      data: {
        actor: `user:${guard.session.user.id}`,
        action: "EXCEL_CONNECTED",
        entity: `project:${projectId}`,
        after: JSON.stringify({ fileLocation }),
      },
    });

    revalidatePath("/onboarding");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return { ok: true, message: "Excel mənbəyi qoşuldu." };
  } catch {
    return { ok: false, message: "Nəsə düz getmədi. Bir azdan yenidən cəhd edin." };
  }
}

/**
 * Onboarding step 2: the human confirms the anchor mapping once. Thereafter
 * write-back only touches these system-owned cells. Admin only.
 */
export async function confirmAnchorMapping(projectId: string): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const source = await prisma.excelSource.findUnique({ where: { projectId } });
  if (!source) return { ok: false, message: "Əvvəlcə Excel mənbəyini qoşun." };

  await prisma.excelSource.update({
    where: { projectId },
    data: { confirmed: true },
  });
  await prisma.auditLog.create({
    data: {
      actor: `user:${guard.session.user.id}`,
      action: "EXCEL_ANCHORS_CONFIRMED",
      entity: `project:${projectId}`,
    },
  });

  revalidatePath("/onboarding");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, message: "Anchor xəritəsi təsdiqləndi." };
}
