"use server";

import { auth } from "@/auth";
import { canManageUsers, canApprove } from "@/lib/constants";
import { sendTestNotification, isNotifyConfigured } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/notify/email";
import { isTelegramConfigured } from "@/lib/notify/telegram";
import { sendWeeklyReport } from "@/lib/reports/weekly";
import { sendRiskAlert } from "@/lib/reports/risk";

type Result = { ok: boolean; message: string };

/** Admin-only: send a test notification so the user can verify their integration. */
export async function sendTestNotificationAction(): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  if (!canManageUsers(session.user.role)) {
    return { ok: false, message: "Bu əməliyyat üçün icazəniz yoxdur." };
  }
  if (!isNotifyConfigured()) {
    return {
      ok: false,
      message: "Bildiriş kanalı quraşdırılmayıb (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).",
    };
  }

  const res = await sendTestNotification();
  return res.ok
    ? { ok: true, message: "Test bildirişi göndərildi." }
    : { ok: false, message: `Göndərmə alınmadı: ${res.error ?? "xəta"}.` };
}

/**
 * Build the status digest (risks + completed tasks + workload) right now and
 * push it to every configured channel (Email and/or Telegram). Allowed for any
 * approver role (OWNER/DEPUTY_OWNER/PM) — this is the PM's own start-of-day
 * digest, not a user-admin action. Same report a scheduler would send via
 * `POST /api/ai/weekly-report`.
 */
export async function sendWeeklyReportNowAction(): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  if (!canApprove(session.user.role)) {
    return { ok: false, message: "Bu əməliyyat üçün icazəniz yoxdur." };
  }
  if (!isEmailConfigured() && !isTelegramConfigured()) {
    return {
      ok: false,
      message: "Bildiriş kanalı quraşdırılmayıb (Email və ya Telegram).",
    };
  }

  const res = await sendWeeklyReport();
  if (res.delivered) {
    const where = (res.channels ?? [])
      .map((c) => (c === "email" ? "Email" : "Telegram"))
      .join(" + ");
    return {
      ok: true,
      message: res.narrated
        ? `Xülasə göndərildi (${where}).`
        : `Xülasə göndərildi (${where}) — AI mətni olmadan, model əlçatmaz idi.`,
    };
  }
  return { ok: false, message: `Göndərmə alınmadı: ${res.error ?? "xəta"}.` };
}

/**
 * Scan every project for risks now and push an alert to the configured channels.
 * Manual trigger → force:true, so the user always gets a reply (an explicit
 * "all clear" when nothing is wrong). Approver roles (OWNER/DEPUTY_OWNER/PM).
 * Fully deterministic — works even when the GPU is off.
 */
export async function sendRiskAlertNowAction(): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  if (!canApprove(session.user.role)) {
    return { ok: false, message: "Bu əməliyyat üçün icazəniz yoxdur." };
  }
  if (!isEmailConfigured() && !isTelegramConfigured()) {
    return { ok: false, message: "Bildiriş kanalı quraşdırılmayıb (Email və ya Telegram)." };
  }

  const res = await sendRiskAlert({ force: true });
  if (res.delivered) {
    const where = res.channels.map((c) => (c === "email" ? "Email" : "Telegram")).join(" + ");
    return {
      ok: true,
      message:
        res.count > 0
          ? `${res.count} risk tapıldı və bildiriş göndərildi (${where}).`
          : `Risk yoxdur — "hər şey qaydasında" bildirişi göndərildi (${where}).`,
    };
  }
  return { ok: false, message: `Göndərmə alınmadı: ${res.error ?? "xəta"}.` };
}
