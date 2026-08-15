// Scheduled weekly-report delivery (closes the last 5b "PARTIAL" item).
//
// Produces a weekly status report and emails it to the configured notify
// recipient. Two layers, so delivery never depends on the LLM being up:
//   1) a DETERMINISTIC data snapshot (projects, risks, workload, billable) that
//      always renders — the reliable backbone of the email, and
//   2) an OPTIONAL Azerbaijani narrative from the local Reporting agent, added
//      on top when Ollama is reachable.
// Server-only (Prisma + nodemailer). Never throws from the send path.

import { prisma } from "@/lib/prisma";
import { isOverdue, isDueToday, formatDate } from "@/lib/format";
import { getWorkload, getBillableSummary, getPendingApprovalCount } from "@/lib/data";
import { buildAiContext } from "@/lib/ollama/context";
import { generateReportText } from "@/lib/ollama/agents";
import { sendEmail, isEmailConfigured } from "@/lib/notify/email";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/notify/telegram";

export type WeeklyReportData = {
  generatedAt: Date;
  projects: { name: string; status: string; done: number; total: number }[];
  overdue: { title: string; project: string; assignee: string; due: string }[];
  dueTodayCount: number;
  pendingApprovals: number;
  workload: {
    name: string;
    assignedHours: number;
    capacity: number;
    openTasks: number;
    over: boolean;
  }[];
  billable: { totalLogged: number; totalEstimated: number };
  snapshot: string; // English grounding snapshot, for the LLM narrative
};

/** Gather the deterministic report data in one pass. */
export async function buildWeeklyReportData(): Promise<WeeklyReportData> {
  const [projects, tasks, workloadRaw, billable, pendingApprovals, ctx] =
    await Promise.all([
      prisma.project.findMany({ select: { id: true, name: true, status: true } }),
      prisma.task.findMany({
        include: { project: { select: { name: true } }, assignee: { select: { name: true } } },
      }),
      getWorkload(),
      getBillableSummary(),
      getPendingApprovalCount(),
      buildAiContext(),
    ]);

  const projectRows = projects.map((p) => {
    const own = tasks.filter((t) => t.projectId === p.id);
    return {
      name: p.name,
      status: p.status,
      done: own.filter((t) => t.status === "DONE").length,
      total: own.length,
    };
  });

  const overdue = tasks
    .filter((t) => t.status !== "DONE" && isOverdue(t.dueDate))
    .map((t) => ({
      title: t.title,
      project: t.project.name,
      assignee: t.assignee?.name ?? "Təyin edilməyib",
      due: formatDate(t.dueDate),
    }));

  const dueTodayCount = tasks.filter(
    (t) => t.status !== "DONE" && isDueToday(t.dueDate),
  ).length;

  const workload = workloadRaw.map((w) => ({
    name: w.name,
    assignedHours: w.assignedHours,
    capacity: w.capacity,
    openTasks: w.openTasks,
    over: w.assignedHours > w.capacity,
  }));

  return {
    generatedAt: new Date(),
    projects: projectRows,
    overdue,
    dueTodayCount,
    pendingApprovals,
    workload,
    billable: {
      totalLogged: billable.totalLogged,
      totalEstimated: billable.totalEstimated,
    },
    snapshot: ctx.snapshot,
  };
}

const AZ_STATUS: Record<string, string> = {
  ACTIVE: "Aktiv",
  ON_HOLD: "Gözləmədə",
  COMPLETED: "Tamamlanıb",
  ARCHIVED: "Arxivlənib",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Deterministic HTML email body; `narrative` is the optional AI paragraph. */
export function renderWeeklyReportHtml(
  data: WeeklyReportData,
  narrative: string | null,
): string {
  const overCap = data.workload.filter((w) => w.over);
  const projectRows = data.projects
    .map(
      (p) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(p.name)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555">${AZ_STATUS[p.status] ?? esc(p.status)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums">${p.done}/${p.total}</td></tr>`,
    )
    .join("");

  const overdueRows =
    data.overdue.length === 0
      ? `<p style="color:#16a34a;margin:6px 0">✓ Gecikən tapşırıq yoxdur.</p>`
      : `<table style="border-collapse:collapse;width:100%;font-size:14px">${data.overdue
          .map(
            (t) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(t.title)}</td>` +
              `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555">${esc(t.project)}</td>` +
              `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555">${esc(t.assignee)}</td>` +
              `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#dc2626;white-space:nowrap">${t.due}</td></tr>`,
          )
          .join("")}</table>`;

  const workloadRows = data.workload
    .map(
      (w) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(w.name)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;${w.over ? "color:#dc2626;font-weight:600" : "color:#555"}">${w.assignedHours}s / ${w.capacity}s</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#555">${w.openTasks}</td></tr>`,
    )
    .join("");

  const narrativeBlock = narrative
    ? `<div style="margin:0 0 22px;padding:14px 16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px">
         <div style="font-size:12px;font-weight:600;color:#6d28d9;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">AI xülasəsi</div>
         <div style="font-size:14px;color:#1f2937;white-space:pre-wrap;line-height:1.55">${esc(narrative)}</div>
       </div>`
    : "";

  const h = (txt: string) =>
    `<h2 style="font-size:15px;color:#111;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #ede9fe">${txt}</h2>`;

  return `<!doctype html><html><body style="margin:0;background:#f6f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="font-size:20px;font-weight:700;color:#111">UniTech PM — həftəlik hesabat</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px">${formatDate(data.generatedAt)}</div>

      <div style="display:flex;flex-wrap:wrap;gap:10px;margin:18px 0">
        ${statPill("Gecikən", String(data.overdue.length), data.overdue.length > 0 ? "#dc2626" : "#16a34a")}
        ${statPill("Bu gün", String(data.dueTodayCount), "#2563eb")}
        ${statPill("Təsdiq gözləyir", String(data.pendingApprovals), data.pendingApprovals > 0 ? "#d97706" : "#16a34a")}
        ${statPill("Həddi aşan", String(overCap.length), overCap.length > 0 ? "#dc2626" : "#16a34a")}
      </div>

      ${narrativeBlock}

      ${h("Layihələr")}
      <table style="border-collapse:collapse;width:100%;font-size:14px">${projectRows}</table>

      ${h("Risklər — gecikən tapşırıqlar")}
      ${overdueRows}

      ${h("Komanda yükü")}
      <table style="border-collapse:collapse;width:100%;font-size:14px">${workloadRows}</table>

      ${h("Vaxt / billable")}
      <p style="font-size:14px;color:#374151;margin:6px 0">
        <b>${data.billable.totalLogged}s</b> qeydə alınıb / ${data.billable.totalEstimated}s planlanıb.
      </p>

      <p style="font-size:12px;color:#9ca3af;margin-top:26px;border-top:1px solid #eee;padding-top:14px">
        Bu hesabat UniTech PM AI köməkçisi tərəfindən avtomatik yaradılıb.
      </p>
    </div>
  </div>
</body></html>`;
}

function statPill(label: string, value: string, color: string): string {
  return `<div style="flex:1;min-width:110px;background:#f9fafb;border:1px solid #eee;border-radius:8px;padding:10px 12px">
    <div style="font-size:22px;font-weight:700;color:${color};line-height:1">${value}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:3px">${label}</div>
  </div>`;
}

/** Plaintext fallback body (for mail clients without HTML). */
export function renderWeeklyReportText(
  data: WeeklyReportData,
  narrative: string | null,
): string {
  const lines: string[] = [];
  lines.push(`UniTech PM — həftəlik hesabat (${formatDate(data.generatedAt)})`);
  lines.push("");
  lines.push(
    `Gecikən: ${data.overdue.length} · Bu gün: ${data.dueTodayCount} · Təsdiq gözləyir: ${data.pendingApprovals} · Həddi aşan: ${data.workload.filter((w) => w.over).length}`,
  );
  if (narrative) {
    lines.push("");
    lines.push("AI XÜLASƏSİ:");
    lines.push(narrative);
  }
  lines.push("");
  lines.push("LAYİHƏLƏR:");
  for (const p of data.projects) {
    lines.push(`- ${p.name} [${AZ_STATUS[p.status] ?? p.status}] ${p.done}/${p.total}`);
  }
  lines.push("");
  lines.push("GECİKƏN TAPŞIRIQLAR:");
  if (data.overdue.length === 0) lines.push("- yoxdur");
  for (const t of data.overdue) {
    lines.push(`- ${t.title} (${t.project}, ${t.assignee}, ${t.due})`);
  }
  lines.push("");
  lines.push("KOMANDA YÜKÜ:");
  for (const w of data.workload) {
    lines.push(
      `- ${w.name}: ${w.assignedHours}s / ${w.capacity}s, ${w.openTasks} açıq tapşırıq${w.over ? " (HƏDDİ AŞIB)" : ""}`,
    );
  }
  lines.push("");
  lines.push(
    `VAXT: ${data.billable.totalLogged}s qeydə alınıb / ${data.billable.totalEstimated}s planlanıb.`,
  );
  return lines.join("\n");
}

export type WeeklyReportResult = {
  ok: boolean;
  delivered: boolean;
  narrated: boolean;
  channels?: ("email" | "telegram")[];
  error?: string;
};

/**
 * Build → narrate → render → email the weekly report. Best-effort: no-ops
 * (delivered:false) when email isn't configured, and still succeeds without
 * the AI narrative if Ollama is down.
 */
export async function sendWeeklyReport(): Promise<WeeklyReportResult> {
  const data = await buildWeeklyReportData();
  const narrative = await generateReportText(data.snapshot);
  const text = renderWeeklyReportText(data, narrative);

  const emailOn = isEmailConfigured();
  const telegramOn = isTelegramConfigured();
  if (!emailOn && !telegramOn) {
    return { ok: true, delivered: false, narrated: !!narrative, channels: [], error: "not_configured" };
  }

  // Deliver to every configured channel; success if at least one lands.
  const channels: ("email" | "telegram")[] = [];

  if (emailOn) {
    const res = await sendEmail({
      subject: `UniTech PM — status hesabatı (${formatDate(data.generatedAt)})`,
      html: renderWeeklyReportHtml(data, narrative),
      text,
    });
    if (res.ok) channels.push("email");
  }

  if (telegramOn) {
    // Telegram uses HTML parse mode + a 4096-char cap — escape and trim.
    const tgBody = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 3900);
    const res = await sendTelegramMessage(tgBody);
    if (res.ok) channels.push("telegram");
  }

  const delivered = channels.length > 0;
  return {
    ok: delivered,
    delivered,
    narrated: !!narrative,
    channels,
    error: delivered ? undefined : "send_failed",
  };
}
