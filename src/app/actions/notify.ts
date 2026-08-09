"use server";

import { auth } from "@/auth";
import { canManageUsers } from "@/lib/constants";
import { sendTestNotification, isNotifyConfigured } from "@/lib/notify";
import { isEmailConfigured } from "@/lib/notify/email";
import { sendWeeklyReport } from "@/lib/reports/weekly";

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
 * Admin-only: build and email the weekly status report right now (the same
 * report a scheduler would send via `POST /api/ai/weekly-report`). Requires
 * SMTP to be configured to actually deliver.
 */
export async function sendWeeklyReportNowAction(): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib." };
  if (!canManageUsers(session.user.role)) {
    return { ok: false, message: "Bu əməliyyat üçün icazəniz yoxdur." };
  }
  if (!isEmailConfigured()) {
    return {
      ok: false,
      message: "E-poçt quraşdırılmayıb (SMTP_HOST / SMTP_USER / SMTP_PASS).",
    };
  }

  const res = await sendWeeklyReport();
  if (res.delivered) {
    return {
      ok: true,
      message: res.narrated
        ? "Həftəlik hesabat e-poçtla göndərildi."
        : "Həftəlik hesabat göndərildi (AI xülasəsi olmadan — model əlçatmaz idi).",
    };
  }
  return { ok: false, message: `Göndərmə alınmadı: ${res.error ?? "xəta"}.` };
}
