// Background risk monitor (Phase 3). Scans EVERY project for risks and pushes a
// concise alert to Telegram + email. Fully DETERMINISTIC — it computes the risks
// in code (no LLM), so it works even when the GPU is off and the always-on
// droplet can run it on a schedule. Never throws from the send path.

import { prisma } from "@/lib/prisma";
import { isOverdue, formatDate } from "@/lib/format";
import { getWorkload } from "@/lib/data";
import { detectAnomalies } from "@/lib/excel/analyze";
import type { ParsedTask } from "@/lib/excel/types";
import { sendEmail, isEmailConfigured } from "@/lib/notify/email";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/notify/telegram";

type Extras = {
  sourceId?: string | null;
  dependsOn?: string | null;
  actualHours?: number | null;
  hourlyRate?: number | null;
  budget?: number | null;
  expectedStart?: string | null;
  actualStart?: string | null;
  expectedEnd?: string | null;
  actualEnd?: string | null;
};
function parseExtras(s: unknown): Extras {
  if (typeof s !== "string" || !s) return {};
  try {
    return JSON.parse(s) as Extras;
  } catch {
    return {};
  }
}

export type RiskReport = {
  generatedAt: Date;
  overdue: { title: string; project: string; assignee: string; due: string }[];
  anomalies: { project: string; text: string }[];
  budgetOverruns: { title: string; project: string; cost: number; budget: number }[];
  overHours: { title: string; project: string; est: number; actual: number }[];
  overCapacity: { name: string; assigned: number; capacity: number }[];
  count: number;
  hasRisks: boolean;
};

/** Deterministically gather every risk across all projects. No LLM involved. */
export async function collectRisks(): Promise<RiskReport> {
  const [projects, tasks, workload] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true } }),
    prisma.task.findMany({
      include: { project: { select: { name: true } }, assignee: { select: { name: true } } },
    }),
    getWorkload(),
  ]);

  const overdue = tasks
    .filter((t) => t.status !== "DONE" && isOverdue(t.dueDate))
    .map((t) => ({
      title: t.title,
      project: t.project.name,
      assignee: t.assignee?.name ?? parseExtras(t.customFields).sourceId ?? "təyin edilməyib",
      due: formatDate(t.dueDate),
    }));

  const anomalies: RiskReport["anomalies"] = [];
  const budgetOverruns: RiskReport["budgetOverruns"] = [];
  const overHours: RiskReport["overHours"] = [];

  for (const p of projects) {
    const own = tasks.filter((t) => t.projectId === p.id);

    // Dependency violations + early/late starts — reuse the verified detector by
    // reconstructing a ParsedTask from the DB row + stored extras.
    const parsed: ParsedTask[] = own.map((t) => {
      const x = parseExtras(t.customFields);
      return {
        index: 0,
        id: x.sourceId ?? "",
        subId: "",
        title: t.title,
        assignee: t.assignee?.name ?? "",
        assignee2: "",
        dependsOn: x.dependsOn ?? "",
        status: t.status,
        priority: t.priority,
        start: x.actualStart ?? x.expectedStart ?? null,
        end: x.expectedEnd ?? null,
        expectedStart: x.expectedStart ?? null,
        actualStart: x.actualStart ?? null,
        expectedEnd: x.expectedEnd ?? null,
        actualEnd: x.actualEnd ?? null,
        hours: t.estimatedHours ?? null,
        actualHours: x.actualHours ?? null,
        hourlyRate: x.hourlyRate ?? null,
        budget: x.budget ?? null,
        initialBudget: null,
        note: "",
      };
    });
    for (const a of detectAnomalies(parsed)) anomalies.push({ project: p.name, text: a });

    for (const t of own) {
      const x = parseExtras(t.customFields);
      if (x.actualHours != null && x.hourlyRate != null && x.budget != null) {
        const cost = x.actualHours * x.hourlyRate;
        if (cost > x.budget)
          budgetOverruns.push({ title: t.title, project: p.name, cost, budget: x.budget });
      }
      if (x.actualHours != null && t.estimatedHours != null && x.actualHours > t.estimatedHours) {
        overHours.push({ title: t.title, project: p.name, est: t.estimatedHours, actual: x.actualHours });
      }
    }
  }

  const overCapacity = workload
    .filter((w) => w.assignedHours > w.capacity)
    .map((w) => ({ name: w.name, assigned: w.assignedHours, capacity: w.capacity }));

  const count =
    overdue.length + anomalies.length + budgetOverruns.length + overHours.length + overCapacity.length;

  return {
    generatedAt: new Date(),
    overdue,
    anomalies,
    budgetOverruns,
    overHours,
    overCapacity,
    count,
    hasRisks: count > 0,
  };
}

// Keep each section short so the Telegram message stays well under the 4096 cap.
const MAX_PER_SECTION = 8;

/** Concise Azerbaijani plain-text body (used for email text + Telegram). */
export function renderRiskText(r: RiskReport): string {
  const lines: string[] = [];
  lines.push(`🚨 UniTech PM — Risk bildirişi (${formatDate(r.generatedAt)})`);
  if (!r.hasRisks) {
    lines.push("");
    lines.push("✅ Risk aşkarlanmadı — hər şey qaydasındadır.");
    return lines.join("\n");
  }
  lines.push(`Ümumi ${r.count} risk aşkarlandı.`);

  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push("");
    lines.push(`${title} (${items.length}):`);
    for (const it of items.slice(0, MAX_PER_SECTION)) lines.push(`- ${it}`);
    if (items.length > MAX_PER_SECTION) lines.push(`- … və daha ${items.length - MAX_PER_SECTION}`);
  };

  section(
    "⏰ Gecikmiş tapşırıqlar",
    r.overdue.map((t) => `${t.title} (${t.project}) — ${t.assignee}, ${t.due}`),
  );
  section("🔗 Tarix / asılılıq anomaliyaları", r.anomalies.map((a) => `(${a.project}) ${a.text}`));
  section(
    "💰 Büdcə aşımı",
    r.budgetOverruns.map((b) => `${b.title} (${b.project}): xərc ${b.cost} AZN > büdcə ${b.budget} AZN`),
  );
  section(
    "⏱️ Saat aşımı",
    r.overHours.map((h) => `${h.title} (${h.project}): faktiki ${h.actual}s > təxmini ${h.est}s`),
  );
  section(
    "👤 Həddi aşan komanda",
    r.overCapacity.map((w) => `${w.name}: ${w.assigned}s / ${w.capacity}s`),
  );
  return lines.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Simple HTML body for the email channel. */
export function renderRiskHtml(r: RiskReport): string {
  const body = esc(renderRiskText(r)).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f6f6f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06);font-size:14px;line-height:1.6;white-space:normal">${body}</div>
  </div></body></html>`;
}

export type RiskAlertResult = {
  ok: boolean;
  delivered: boolean;
  channels: ("email" | "telegram")[];
  count: number;
  reason?: string;
  error?: string;
};

/**
 * Scan → (if risks OR force) → deliver a risk alert to every configured channel.
 * `force` sends even when there are no risks (used by the manual button so the
 * user gets an explicit "all clear"). The scheduled/cron path leaves force off,
 * so it only notifies when something is actually wrong.
 */
export async function sendRiskAlert(opts: { force?: boolean } = {}): Promise<RiskAlertResult> {
  const report = await collectRisks();
  if (!report.hasRisks && !opts.force) {
    return { ok: true, delivered: false, channels: [], count: 0, reason: "no_risks" };
  }

  const emailOn = isEmailConfigured();
  const telegramOn = isTelegramConfigured();
  if (!emailOn && !telegramOn) {
    return { ok: true, delivered: false, channels: [], count: report.count, reason: "not_configured" };
  }

  const text = renderRiskText(report);
  const channels: ("email" | "telegram")[] = [];

  if (emailOn) {
    const res = await sendEmail({
      subject: `UniTech PM — Risk bildirişi (${report.count})`,
      html: renderRiskHtml(report),
      text,
    });
    if (res.ok) channels.push("email");
  }
  if (telegramOn) {
    const res = await sendTelegramMessage(esc(text).slice(0, 3900));
    if (res.ok) channels.push("telegram");
  }

  const delivered = channels.length > 0;
  return {
    ok: delivered,
    delivered,
    channels,
    count: report.count,
    error: delivered ? undefined : "send_failed",
  };
}
