// Notification dispatch layer (track 5d). Fans out to every configured channel
// (Telegram + SMTP email). Every path is best-effort and NEVER throws —
// notifications must not affect the approval / scan flow.

import { sendTelegramMessage, isTelegramConfigured } from "./telegram";
import { sendEmail, isEmailConfigured } from "./email";

export { isTelegramConfigured, isEmailConfigured };

export function isNotifyConfigured(): boolean {
  return isTelegramConfigured() || isEmailConfigured();
}

export function getNotifyStatus(): {
  telegram: boolean;
  email: boolean;
  any: boolean;
} {
  const telegram = isTelegramConfigured();
  const email = isEmailConfigured();
  return { telegram, email, any: telegram || email };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Fire-and-forget: tell approvers a new item is waiting. Call WITHOUT awaiting
 * (e.g. `void notifyApprovalCreated(...)`) so approval creation is never delayed
 * or broken by a slow/failed notifier. No-ops per channel when unconfigured.
 */
export async function notifyApprovalCreated(input: {
  title: string;
  agent: string;
  type: string;
}): Promise<void> {
  const title = escapeHtml(input.title);
  const meta = `${escapeHtml(input.agent)} · ${escapeHtml(input.type)}`;
  try {
    await Promise.allSettled([
      isTelegramConfigured()
        ? sendTelegramMessage(
            `🔔 <b>Yeni təsdiq gözləyir</b>\n${title}\n<i>Agent: ${meta}</i>`,
          )
        : Promise.resolve(),
      isEmailConfigured()
        ? sendEmail({
            subject: "UniTech PM — yeni təsdiq gözləyir",
            text: `Yeni təsdiq gözləyir: ${input.title} (Agent: ${input.agent} · ${input.type})`,
            html: `<h3>🔔 Yeni təsdiq gözləyir</h3><p>${title}</p><p style="color:#666"><i>Agent: ${meta}</i></p>`,
          })
        : Promise.resolve(),
    ]);
  } catch {
    /* never throw from a notification */
  }
}

/** Send a test message to every configured channel so the user can verify setup. */
export async function sendTestNotification(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const results = await Promise.allSettled([
    isTelegramConfigured()
      ? sendTelegramMessage(
          "✅ <b>UniTech PM</b> — test bildirişi. Telegram inteqrasiyası işləyir.",
        )
      : null,
    isEmailConfigured()
      ? sendEmail({
          subject: "UniTech PM — test bildirişi",
          text: "UniTech PM email inteqrasiyası işləyir.",
          html: "<p>✅ <b>UniTech PM</b> — test bildirişi. Email inteqrasiyası işləyir.</p>",
        })
      : null,
  ]);

  // ok if at least one configured channel accepted the message.
  const sent = results.filter(
    (r) => r.status === "fulfilled" && r.value && r.value.ok,
  );
  const errors = results
    .filter((r) => r.status === "fulfilled" && r.value && !r.value.ok)
    .map((r) => (r as PromiseFulfilledResult<{ error?: string }>).value.error);

  if (sent.length > 0) return { ok: true };
  return { ok: false, error: errors[0] ?? "not_configured" };
}
