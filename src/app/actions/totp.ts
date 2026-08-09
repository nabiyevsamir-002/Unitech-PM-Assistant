"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApprove, canManageUsers } from "@/lib/constants";
import {
  generateSecret,
  verifyTotp,
  otpauthUri,
  formatSecretForDisplay,
} from "@/lib/totp";

type Result = { ok: boolean; message: string };

/**
 * Begin 2FA enrollment for the current (approver-role) user: generate a secret,
 * store it as pending (totpEnabled stays false — login is NOT enforced yet), and
 * return the secret + otpauth URI once so the UI can show it for authenticator setup.
 */
export async function startTotpEnrollment(): Promise<
  Result & { secret?: string; otpauth?: string; formatted?: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  if (!canApprove(session.user.role)) {
    return { ok: false, message: "2FA yalnız təsdiqləyən rollar üçündür." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true, email: true },
  });
  if (!user) return { ok: false, message: "İstifadəçi tapılmadı." };
  if (user.totpEnabled) {
    return { ok: false, message: "2FA artıq aktivdir." };
  }

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });

  return {
    ok: true,
    message: "Açar yaradıldı — authenticator tətbiqinə əlavə edin.",
    secret,
    formatted: formatSecretForDisplay(secret),
    otpauth: otpauthUri(secret, user.email),
  };
}

/** Confirm enrollment: verify a code against the pending secret, then enable 2FA. */
export async function confirmTotpEnrollment(code: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user?.totpSecret) {
    return { ok: false, message: "Əvvəlcə 2FA quraşdırmasına başlayın." };
  }
  if (!verifyTotp(user.totpSecret, code)) {
    return { ok: false, message: "Kod yanlışdır. Yenidən cəhd edin." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: true },
  });
  await prisma.auditLog.create({
    data: {
      actor: `user:${session.user.id}`,
      action: "TOTP_ENABLED",
      entity: `user:${session.user.id}`,
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: "2FA aktivləşdirildi." };
}

/**
 * Disable 2FA for the current user. If it is enabled, a valid current code is
 * required (proves possession); if only pending, this just cancels enrollment.
 */
export async function disableTotp(code: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user?.totpSecret) return { ok: true, message: "2FA onsuz da deaktivdir." };

  if (user.totpEnabled && !verifyTotp(user.totpSecret, code)) {
    return { ok: false, message: "Kod yanlışdır. Yenidən cəhd edin." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: null, totpEnabled: false },
  });
  await prisma.auditLog.create({
    data: {
      actor: `user:${session.user.id}`,
      action: "TOTP_DISABLED",
      entity: `user:${session.user.id}`,
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: "2FA deaktiv edildi." };
}

/**
 * Admin lockout recovery: clear another user's 2FA so they can re-enroll.
 * Admin-only; cannot be used to bypass 2FA (it disables it, forcing re-setup).
 */
export async function resetUserTotp(userId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  if (!canManageUsers(session.user.role)) {
    return { ok: false, message: "Bu əməliyyat üçün icazəniz yoxdur." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: null, totpEnabled: false },
  });
  await prisma.auditLog.create({
    data: {
      actor: `user:${session.user.id}`,
      action: "TOTP_RESET",
      entity: `user:${userId}`,
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: "İstifadəçinin 2FA-sı sıfırlandı." };
}
