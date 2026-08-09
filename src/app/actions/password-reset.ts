"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/notify/email";
import { checkRateLimit } from "@/lib/rate-limit";

// Email-OTP password reset. Both actions are PUBLIC (called before sign-in), so
// they are hardened: generic responses that never reveal whether an email
// exists, per-key rate limiting, a bcrypt-hashed code, a short expiry, and an
// attempt cap that bounds brute force of the 6-digit space.

const CODE_TTL_MS = 15 * 60_000; // 15 minutes
const MAX_ATTEMPTS = 5;
const MIN_PASSWORD = 8;

type Result = { ok: boolean; message: string; devCode?: string };

// Never reveals whether the account exists — always the same wording.
const GENERIC_REQUEST_MSG =
  "Əgər bu e-poçt üçün hesab varsa, təsdiq kodu göndərildi. Poçtunuzu yoxlayın.";
const GENERIC_INVALID_MSG =
  "Kod yanlışdır və ya vaxtı bitib. Yeni kod tələb edin.";

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function ip(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/**
 * Step 1 — request a reset code. Generates a 6-digit code, stores only its hash
 * (replacing any prior request for the user), and emails it. Always returns the
 * same generic success message. In development the code is echoed back
 * (`devCode`) so the flow is testable without SMTP — this NEVER happens in a
 * production build.
 */
export async function requestPasswordReset(emailRaw: string): Promise<Result> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, message: "Düzgün e-poçt daxil edin." };
  }

  // Throttle per email AND per IP; on limit, still return the generic success
  // so the throttle itself doesn't become an account-enumeration oracle.
  const byEmail = checkRateLimit("pwreset-req-email", email, {
    limit: 3,
    windowMs: CODE_TTL_MS,
  });
  const byIp = checkRateLimit("pwreset-req-ip", await ip(), {
    limit: 10,
    windowMs: CODE_TTL_MS,
  });
  if (!byEmail.ok || !byIp.ok) return { ok: true, message: GENERIC_REQUEST_MSG };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true },
  });

  // Only issue a code for a real, active account — but say nothing either way.
  if (!user || !user.isActive) return { ok: true, message: GENERIC_REQUEST_MSG };

  const code = sixDigitCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // One live code per user: drop any earlier request, then create the new one.
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
    prisma.passwordReset.create({ data: { userId: user.id, codeHash, expiresAt } }),
  ]);

  await prisma.auditLog.create({
    data: {
      actor: `user:${user.id}`,
      action: "PASSWORD_RESET_REQUESTED",
      entity: `user:${user.id}`,
    },
  });

  // Best-effort email (no-ops when SMTP unset). Never blocks the response.
  void sendEmail({
    subject: "UniTech PM — şifrə sıfırlama kodu",
    text: `Şifrə sıfırlama kodunuz: ${code}\nKod 15 dəqiqə etibarlıdır. Bu sorğunu siz etməmisinizsə, bu məktubu nəzərə almayın.`,
    html: `<h3>Şifrə sıfırlama kodu</h3><p>Kodunuz: <b style="font-size:20px;letter-spacing:3px">${code}</b></p><p style="color:#666">Kod 15 dəqiqə etibarlıdır. Bu sorğunu siz etməmisinizsə, bu məktubu nəzərə almayın.</p>`,
  });

  const devCode =
    process.env.NODE_ENV === "development" ? code : undefined;
  return { ok: true, message: GENERIC_REQUEST_MSG, devCode };
}

/**
 * Step 2 — verify the code and set a new password. Enforces the attempt cap and
 * expiry, then updates the bcrypt password hash and consumes the code. Generic
 * failure messages throughout.
 */
export async function resetPassword(
  emailRaw: string,
  code: string,
  newPassword: string,
): Promise<Result> {
  const email = emailRaw.trim().toLowerCase();
  const cleanCode = code.replace(/\D/g, "");

  if (newPassword.length < MIN_PASSWORD) {
    return {
      ok: false,
      message: `Şifrə ən azı ${MIN_PASSWORD} simvol olmalıdır.`,
    };
  }
  if (cleanCode.length !== 6) {
    return { ok: false, message: GENERIC_INVALID_MSG };
  }

  // Throttle verification attempts per IP to cap brute force across accounts.
  const byIp = checkRateLimit("pwreset-verify-ip", await ip(), {
    limit: 15,
    windowMs: CODE_TTL_MS,
  });
  if (!byIp.ok) {
    return { ok: false, message: "Çox cəhd edildi. Bir azdan yenidən cəhd edin." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) return { ok: false, message: GENERIC_INVALID_MSG };

  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!reset) return { ok: false, message: GENERIC_INVALID_MSG };

  if (reset.expiresAt.getTime() < Date.now()) {
    await prisma.passwordReset.delete({ where: { id: reset.id } });
    return { ok: false, message: GENERIC_INVALID_MSG };
  }
  if (reset.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      message: "Çox səhv cəhd. Zəhmət olmasa yeni kod tələb edin.",
    };
  }

  const match = await bcrypt.compare(cleanCode, reset.codeHash);
  if (!match) {
    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, message: GENERIC_INVALID_MSG };
  }

  // Success: set the new password and consume every reset for this user.
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({
      data: {
        actor: `user:${user.id}`,
        action: "PASSWORD_RESET_COMPLETED",
        entity: `user:${user.id}`,
      },
    }),
  ]);

  return {
    ok: true,
    message: "Şifrə yeniləndi. İndi yeni şifrənizlə daxil ola bilərsiniz.",
  };
}
