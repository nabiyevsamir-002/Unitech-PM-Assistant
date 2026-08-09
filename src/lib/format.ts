import type { Lang } from "@/lib/i18n";

const TIME_ZONE = "Asia/Baku";

// Build dd.mm.yyyy manually from timezone-correct parts so the output is
// identical across runtimes (some environments lack az-AZ locale data and
// would otherwise fall back to ISO yyyy-mm-dd).
function parts(d: Date): Record<string, string> {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const part of p) out[part.type] = part.value;
  return out;
}

/** Format a date as dd.mm.yyyy in the Baku timezone. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const p = parts(d);
  return `${p.day}.${p.month}.${p.year}`;
}

/** Format a date+time as dd.mm.yyyy HH:mm. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const p = parts(d);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

export function formatCurrency(
  amount: number,
  currency: string = "AZN",
  lang: Lang = "az",
): string {
  try {
    return new Intl.NumberFormat(lang === "az" ? "az-AZ" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Start of today in Baku time, as a Date (UTC instant). */
export function startOfTodayBaku(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // yyyy-mm-dd
  // Baku is UTC+4 (no DST since 2016).
  return new Date(`${parts}T00:00:00+04:00`);
}

export function endOfTodayBaku(): Date {
  const start = startOfTodayBaku();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Today's date in Baku time as a yyyy-mm-dd string (for AI grounding). */
export function todayBakuISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Relative-ish helpers for tasks. */
export function isOverdue(dueDate: Date | string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return d.getTime() < startOfTodayBaku().getTime();
}

export function isDueToday(dueDate: Date | string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return (
    d.getTime() >= startOfTodayBaku().getTime() &&
    d.getTime() <= endOfTodayBaku().getTime()
  );
}

/**
 * True when "today" (Baku) falls inside a member's leave window. Either bound
 * may be open: only `from` → unavailable from that day on; only `to` →
 * unavailable up to and including that day. `to` is treated as inclusive.
 */
export function isCurrentlyUnavailable(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): boolean {
  if (!from && !to) return false;
  const now = Date.now();
  const f = from ? new Date(from) : null;
  // Include the whole `to` day (end of that day in Baku).
  const tRaw = to ? new Date(to) : null;
  const t = tRaw ? new Date(tRaw.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
  if (f && now < f.getTime()) return false;
  if (t && now > t.getTime()) return false;
  return true;
}
