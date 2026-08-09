"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyApprovalCreated } from "@/lib/notify";
import { sendEmail } from "@/lib/notify/email";

// Public self-registration. Anyone may request an account, but it is created
// INACTIVE + pendingApproval=true and cannot sign in until an admin approves it
// (via the normal Approvals inbox — see the APPROVE_USER case in the executor).
// New accounts are always MEMBER; only an admin can elevate the role afterwards.

const MIN_PASSWORD = 8;
const REGISTERED_MSG =
  "Qeydiyyat sorğunuz göndərildi. Hesabınız administrator təsdiqindən sonra aktivləşəcək.";

type Result = { ok: boolean; message: string };

const input = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD).max(200),
});

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

export async function registerUser(raw: {
  name: string;
  email: string;
  password: string;
}): Promise<Result> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: `Ad, düzgün e-poçt və ən azı ${MIN_PASSWORD} simvol şifrə tələb olunur.`,
    };
  }
  const { name, email, password } = parsed.data;

  // Throttle account-creation per IP to prevent pending-user spam.
  const rl = checkRateLimit("register-ip", await ip(), {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rl.ok) {
    return { ok: true, message: REGISTERED_MSG }; // stay generic even when throttled
  }

  // If the email already exists (active OR pending), say nothing specific —
  // avoids account enumeration and duplicate rows (email is unique).
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return { ok: true, message: REGISTERED_MSG };

  const passwordHash = await bcrypt.hash(password, 10);

  // Create the pending user AND its approval atomically.
  const { approvalTitle } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "MEMBER",
        isActive: false,
        pendingApproval: true,
      },
    });
    const title = `«${name}» hesab təsdiqi gözləyir`;
    await tx.approval.create({
      data: {
        type: "APPROVE_USER",
        proposedByAgent: "Sistem",
        title,
        summary: `${name} (${email}) yeni hesab yaratdı və təsdiq gözləyir. Təsdiqləsəniz hesab aktivləşəcək; rədd etsəniz silinəcək.`,
        payload: JSON.stringify({ entity: "user", userId: user.id, name, email }),
        status: "PENDING",
      },
    });
    await tx.auditLog.create({
      data: {
        actor: `user:${user.id}`,
        action: "USER_REGISTERED",
        entity: `user:${user.id}`,
        after: JSON.stringify({ email, name }),
      },
    });
    return { approvalTitle: title };
  });

  // Best-effort side effects (never block/break registration):
  // 1) tell the admins a new approval is waiting (Telegram + email fan-out),
  void notifyApprovalCreated({
    title: approvalTitle,
    agent: "Sistem",
    type: "APPROVE_USER",
  });
  // 2) tell the registrant their account is pending.
  void sendEmail({
    to: email,
    subject: "UniTech PM — hesabınız təsdiq gözləyir",
    text: `Salam ${name},\n\nUniTech PM-də hesab yaratdınız. Hesabınız administrator təsdiqindən sonra aktivləşəcək. Təsdiqləndikdə sizə ayrıca məktub gələcək.`,
    html: `<p>Salam ${escapeHtml(name)},</p><p>UniTech PM-də hesab yaratdınız. Hesabınız <b>administrator təsdiqindən</b> sonra aktivləşəcək.</p><p style="color:#666">Təsdiqləndikdə sizə ayrıca məktub gələcək.</p>`,
  });

  return { ok: true, message: REGISTERED_MSG };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
