"use server";

import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MIN_PASSWORD = 8;

type Result = { ok: boolean; message: string };

/**
 * Self-service password change for the signed-in user: verifies the current
 * password, then sets a new bcrypt hash. Any authenticated user may do this
 * for their own account (no admin role required).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sessiya bitib. Yenidən daxil olun." };
  }
  if (newPassword.length < MIN_PASSWORD) {
    return { ok: false, message: `Yeni şifrə ən azı ${MIN_PASSWORD} simvol olmalıdır.` };
  }
  if (newPassword === currentPassword) {
    return { ok: false, message: "Yeni şifrə köhnədən fərqli olmalıdır." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    return { ok: false, message: "Sessiya etibarsızdır. Yenidən daxil olun." };
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return { ok: false, message: "Cari şifrə yanlışdır." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await prisma.auditLog.create({
    data: {
      actor: `user:${user.id}`,
      action: "PASSWORD_CHANGED",
      entity: `user:${user.id}`,
    },
  });

  return { ok: true, message: "Şifrə uğurla dəyişdirildi." };
}
