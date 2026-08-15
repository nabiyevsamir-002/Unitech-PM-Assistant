import { isOverdue, isDueToday, formatDate, todayBakuISO } from "@/lib/format";
import type { ParsedTask } from "./types";

// Best-effort "is this task finished" check across common AZ/EN status words.
const DONE_WORDS = ["tamamland", "tamamlan", "bitdi", "hazır", "hazir", "done", "completed", "closed"];
export function isDone(status: string): boolean {
  const s = String(status).trim().toLowerCase();
  return DONE_WORDS.some((w) => s.includes(w));
}

export type ExcelStats = { total: number; done: number; overdue: number; dueToday: number };

export type ExcelAnalysis = {
  stats: ExcelStats;
  /** Full ENGLISH-labelled-in-AZ grounding text; numbers computed here, model only narrates. */
  grounding: string;
};

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.round((a - b) / 86_400_000);
}

/**
 * Date / dependency anomalies, computed from the parsed rows (also reused by the
 * chat snapshot). Detects: actual start earlier/later than the planned start,
 * and dependency violations — a task that started while a task it depends on was
 * not yet finished. `id` + `dependsOn` must carry the source ids to link them.
 */
export function detectAnomalies(tasks: ParsedTask[]): string[] {
  const byId = new Map<string, ParsedTask>();
  for (const t of tasks) if (t.id) byId.set(t.id.trim(), t);
  const out: string[] = [];
  for (const t of tasks) {
    // Early / late actual start vs the planned (expected) start.
    if (t.actualStart && t.expectedStart) {
      const d = daysBetween(t.expectedStart, t.actualStart); // + => started early
      if (d > 0) out.push(`"${t.title}" faktiki ${d} gün ERKƏN başlayıb (gözlənilən ${fmt(t.expectedStart)}, faktiki ${fmt(t.actualStart)}).`);
      else if (d < 0) out.push(`"${t.title}" faktiki ${-d} gün GEC başlayıb (gözlənilən ${fmt(t.expectedStart)}, faktiki ${fmt(t.actualStart)}).`);
    }
    // Dependency violation: this task started while a task it depends on was not
    // yet finished (dependency has no actual end, or ended after this one began).
    if (t.actualStart && t.dependsOn) {
      for (const depId of t.dependsOn.split(/[,;\s]+/).filter(Boolean)) {
        const dep = byId.get(depId.trim());
        if (!dep) continue;
        const depFinished = !!dep.actualEnd && isDone(dep.status);
        if (!depFinished) {
          out.push(
            `ASILILIQ POZUNTUSU: "${t.title}" (faktiki başlama ${fmt(t.actualStart)}) asılı olduğu "${dep.title}" hələ bitməmiş başlayıb (o tapşırığın statusu: ${dep.status || "—"}).`,
          );
        } else if (dep.actualEnd && daysBetween(t.actualStart, dep.actualEnd) < 0) {
          out.push(
            `ASILILIQ POZUNTUSU: "${t.title}" (${fmt(t.actualStart)}) asılı olduğu "${dep.title}" bitməzdən (${fmt(dep.actualEnd)}) əvvəl başlayıb.`,
          );
        }
      }
    }
  }
  return out;
}

/**
 * Turns a parsed task list into (a) headline stats and (b) a grounding block
 * where EVERY figure is pre-computed: combined workload (primary + secondary
 * assignee), initial vs updated budget totals, actual-cost-vs-budget checks
 * (strict >), and date/dependency anomalies. The model only narrates this — it
 * must never recompute, which is exactly where it used to hallucinate.
 */
export function analyzeTasks(tasks: ParsedTask[]): ExcelAnalysis {
  const notDone = tasks.filter((t) => !isDone(t.status));
  const overdue = notDone.filter((t) => isOverdue(t.end));
  const dueToday = notDone.filter((t) => isDueToday(t.end));
  const stats: ExcelStats = {
    total: tasks.length,
    done: tasks.length - notDone.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
  };

  const initTotal = tasks.reduce((s, t) => s + (t.initialBudget ?? t.budget ?? 0), 0);
  const updTotal = tasks.reduce((s, t) => s + (t.budget ?? 0), 0);
  const estTotal = tasks.reduce((s, t) => s + (t.hours ?? 0), 0);
  const actTotal = tasks.reduce((s, t) => s + (t.actualHours ?? 0), 0);

  // Combined workload: a person's estimated hours + task count across BOTH the
  // primary ("Məsul") and secondary ("İkinci İcraçı") columns.
  type Load = { hours: number; primary: number; secondary: number };
  const load = new Map<string, Load>();
  const bump = (name: string, hours: number, role: "primary" | "secondary") => {
    const n = name.trim();
    if (!n) return;
    const e = load.get(n) ?? { hours: 0, primary: 0, secondary: 0 };
    e.hours += hours;
    if (role === "primary") e.primary += 1;
    else e.secondary += 1;
    load.set(n, e);
  };
  for (const t of tasks) {
    const h = t.hours ?? 0;
    bump(t.assignee, h, "primary");
    bump(t.assignee2, h, "secondary");
  }
  const ranked = [...load.entries()].sort((a, b) => b[1].hours - a[1].hours);

  const anomalies = detectAnomalies(tasks);

  // Actual cost (actual hours × hourly rate) vs the updated budget — strict >.
  const costLines: string[] = [];
  for (const t of tasks) {
    if (t.actualHours == null || t.hourlyRate == null || t.budget == null) continue;
    const cost = t.actualHours * t.hourlyRate;
    let verdict: string;
    if (cost > t.budget) verdict = `AŞIB (${cost - t.budget} AZN artıq)`;
    else if (cost === t.budget) verdict = "dəqiq bərabər (aşmayıb)";
    else verdict = `büdcə daxilində (${t.budget - cost} AZN qalıb)`;
    costLines.push(`"${t.title}": faktiki xərc ${cost} AZN (${t.actualHours}s × ${t.hourlyRate} AZN), yenilənmiş büdcə ${t.budget} AZN — ${verdict}.`);
  }

  const lines: string[] = [];
  lines.push(`Bugünkü tarix: ${formatDate(todayBakuISO())} (Bakı vaxtı).`);
  lines.push(
    `Statistika: ümumi ${stats.total} tapşırıq, tamamlanmış ${stats.done}, gecikmiş ${stats.overdue}, bu gün bitən ${stats.dueToday}. (Qrup başlıqları — P1, P2 və s. — tapşırıq sayılmır.)`,
  );
  if (updTotal > 0 || initTotal > 0) {
    if (initTotal !== updTotal)
      lines.push(`Büdcə (pul, AZN): ilkin cəmi ${initTotal}, yenilənmiş cəmi ${updTotal}.`);
    else lines.push(`Büdcə (pul, AZN): cəmi ${updTotal}.`);
  }
  if (estTotal > 0 || actTotal > 0)
    lines.push(`Saatlar (vaxt, pul deyil): təxmini cəmi ${estTotal}, faktiki cəmi ${actTotal}.`);

  lines.push("\nKOMANDA YÜKÜ (əsas + ikinci icraçı BİRLƏŞDİRİLMİŞ, təxmini saat üzrə, çoxdan aza):");
  for (const [name, l] of ranked) {
    lines.push(`- ${name}: ${l.hours} saat, ${l.primary + l.secondary} tapşırıq (${l.primary} əsas + ${l.secondary} ikinci icraçı).`);
  }

  lines.push("\nTARİX / ASILILIQ ANOMALİYALARI:");
  if (anomalies.length === 0) lines.push("- Anomaliya aşkar edilmədi.");
  else for (const a of anomalies) lines.push(`- ${a}`);

  if (costLines.length > 0) {
    lines.push("\nXƏRC vs BÜDCƏ (faktiki saat × saatlıq ödəniş; yalnız 'xərc > büdcə' aşma sayılır, bərabər aşma DEYİL):");
    for (const c of costLines) lines.push(`- ${c}`);
  }

  lines.push("\nTAPŞIRIQLAR:");
  for (const t of tasks) {
    const flags: string[] = [];
    if (!isDone(t.status) && isOverdue(t.end)) flags.push("GECİKİB");
    else if (!isDone(t.status) && isDueToday(t.end)) flags.push("BUGÜN BİTİR");
    if (t.actualHours != null && t.hours != null && t.actualHours > t.hours) flags.push("SAAT AŞIMI");
    const parts = [
      `məsul: ${t.assignee || "təyin edilməyib"}`,
    ];
    if (t.assignee2) parts.push(`ikinci: ${t.assignee2}`);
    parts.push(`status: ${t.status || "—"}`);
    parts.push(`prioritet: ${t.priority || "—"}`);
    if (t.dependsOn) parts.push(`asılılıq: ${t.dependsOn}`);
    parts.push(`başlama (gözl./fakt.): ${t.expectedStart ? fmt(t.expectedStart) : "—"}/${t.actualStart ? fmt(t.actualStart) : "—"}`);
    parts.push(`bitmə: ${t.end ? fmt(t.end) : "—"}`);
    if (t.hours != null || t.actualHours != null) parts.push(`saat: ${t.hours ?? "—"}/${t.actualHours ?? "—"} (təxm./fakt.)`);
    if (t.budget != null) parts.push(`büdcə: ${t.budget} AZN`);
    lines.push(`- ${t.title} | ${parts.join(" | ")}${flags.length ? " [" + flags.join(", ") + "]" : ""}`);
  }

  return { stats, grounding: lines.join("\n") };
}

function fmt(iso: string): string {
  return formatDate(iso);
}
