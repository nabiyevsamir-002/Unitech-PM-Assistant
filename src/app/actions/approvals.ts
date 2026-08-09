"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApprove } from "@/lib/constants";
import { executeApproval } from "@/lib/approvals-executor";
import { sendEmail } from "@/lib/notify/email";

/** Best-effort: tell a just-approved registrant their account is now active. */
function sendApprovedEmail(payloadString: string) {
  try {
    const p = JSON.parse(payloadString) as { email?: string; name?: string };
    if (!p.email) return;
    const name = (p.name ?? "").replace(/[<&>]/g, "");
    void sendEmail({
      to: p.email,
      subject: "UniTech PM — hesabınız təsdiqləndi",
      text: `Salam ${p.name ?? ""},\n\nHesabınız təsdiqləndi və aktivdir. Artıq daxil ola bilərsiniz.`,
      html: `<p>Salam ${name},</p><p>✅ Hesabınız <b>təsdiqləndi</b> və aktivdir. Artıq daxil ola bilərsiniz.</p>`,
    });
  } catch {
    /* never throw from a notification */
  }
}

export type DecisionResult = { ok: boolean; message: string };

export async function decideApproval(
  id: string,
  decision: "APPROVED" | "REJECTED",
  opts?: { editedPayload?: Record<string, unknown>; reason?: string },
): Promise<DecisionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sessiya bitib. Yenidən daxil olun." };
  }
  if (!canApprove(session.user.role)) {
    return {
      ok: false,
      message: "Sizin bu əməliyyatı təsdiqləmək icazəniz yoxdur.",
    };
  }

  // Guard against a stale session (e.g. the user was removed / DB reseeded):
  // otherwise setting decidedById would raise a raw foreign-key error.
  const decider = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!decider) {
    return { ok: false, message: "Sessiya etibarsızdır. Yenidən daxil olun." };
  }

  const approval = await prisma.approval.findUnique({ where: { id } });
  if (!approval) {
    return { ok: false, message: "Təsdiq tapılmadı." };
  }
  if (approval.status !== "PENDING") {
    return { ok: false, message: "Bu təsdiq artıq emal olunub." };
  }

  // Optionally apply edits from the "Edit & approve" flow before executing.
  const payloadString = opts?.editedPayload
    ? JSON.stringify(opts.editedPayload)
    : approval.payload;

  if (decision === "REJECTED") {
    await prisma.approval.update({
      where: { id },
      data: {
        status: "REJECTED",
        decidedById: decider.id,
        decidedAt: new Date(),
        reason: opts?.reason ?? null,
        payload: payloadString,
      },
    });
    // Rejecting a self-registration removes the pending account so the person
    // can register again later; guarded so we never delete an active user.
    if (approval.type === "APPROVE_USER") {
      try {
        const p = JSON.parse(payloadString) as { userId?: string };
        if (p.userId) {
          await prisma.user.deleteMany({
            where: { id: p.userId, isActive: false, pendingApproval: true },
          });
        }
      } catch {
        /* ignore malformed payload */
      }
    }
    revalidatePathsAfterDecision();
    revalidatePath("/settings");
    return { ok: true, message: "Əməliyyat rədd edildi." };
  }

  // APPROVED → execute the effect and mark as approved ATOMICALLY, so a
  // failure never leaves the change applied while the approval stays pending.
  try {
    const resultMessage = await prisma.$transaction(async (tx) => {
      const message = await executeApproval(tx, {
        id: approval.id,
        type: approval.type,
        proposedByAgent: approval.proposedByAgent,
        payload: payloadString,
      });

      await tx.approval.update({
        where: { id },
        data: {
          status: "APPROVED",
          decidedById: decider.id,
          decidedAt: new Date(),
          payload: payloadString,
        },
      });

      return message;
    });

    // Post-commit side effect: a newly approved registrant gets a welcome email.
    if (approval.type === "APPROVE_USER") sendApprovedEmail(payloadString);

    revalidatePathsAfterDecision();
    revalidatePath("/settings");
    return { ok: true, message: resultMessage };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Əməliyyat icra olunarkən xəta baş verdi.";
    return { ok: false, message: msg };
  }
}

function revalidatePathsAfterDecision() {
  revalidatePath("/dashboard");
  revalidatePath("/approvals");
  revalidatePath("/board");
  revalidatePath("/projects");
}
