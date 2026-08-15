import ExcelJS from "exceljs";
import path from "node:path";
import type { ExcelCellValue, ExcelModel, ExcelSheet, ParsedTask } from "./types";

/** Resolve a stored (repo-relative or absolute) file location to an abs path. */
export function resolveExcelPath(fileLocation: string): string {
  return path.isAbsolute(fileLocation)
    ? fileLocation
    : path.join(process.cwd(), fileLocation);
}

/** Normalize any ExcelJS cell value into a plain, serializable value. */
export function normalizeCell(value: unknown): ExcelCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("text" in v) return String(v.text); // hyperlink / rich text
    if ("result" in v) return normalizeCell(v.result); // formula
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join("");
    }
    if ("error" in v) return String(v.error);
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function loadWorkbook(absPath: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);
  return wb;
}

export function getCell(
  wb: ExcelJS.Workbook,
  sheet: string,
  cell: string,
): ExcelCellValue {
  const ws = wb.getWorksheet(sheet);
  if (!ws) return null;
  return normalizeCell(ws.getCell(cell).value);
}

// Substrings that mark a "task name" header cell. Matched by SUBSTRING
// (case-insensitive) so natural Azerbaijani headers like "Tapşırığın Adı",
// "İşin adı", "Fəaliyyət" and English "Task name" are all recognized — not just
// an exact "Task"/"Tapşırıq". ("tapşırığ" covers the possessive stem "tapşırığın".)
const TITLE_HINTS = [
  "tapşırıq",
  "tapşırığ",
  "işin ad",
  "iş ad",
  "task",
  "fəaliyyət",
  "görüləcək",
];

// Azerbaijani-safe lowercase for header matching. JS lowercases the AZ capital
// "İ" (U+0130) to "i" + a combining dot (U+0307), which breaks substring checks
// like includes("icraçı") / includes("iş"). Strip ONLY that combining dot (not a
// full NFD decompose — that would also split "ş"→"s" and break the hints).
function lc(c: ExcelCellValue): string {
  if (typeof c !== "string") return "";
  return c.toLowerCase().replace(/\u0307/g, "").trim();
}

function isTitleHeaderCell(c: ExcelCellValue): boolean {
  const h = lc(c);
  return !!h && TITLE_HINTS.some((n) => h.includes(n));
}

/**
 * Pick the task-NAME column, preferring an explicit name header and never
 * mistaking an id column (e.g. "Tapşırıq ID") for the task title.
 */
function findTitleCol(header: string[]): number {
  // 1) A task/work word paired with "ad" (adı) — e.g. "Tapşırığın adı", "İşin adı".
  let idx = header.findIndex(
    (h) => /(tapşır|iş|task|fəaliyyət|görül)/.test(h) && h.includes("ad"),
  );
  if (idx >= 0) return idx;
  // 2) A task/work word that is NOT an id column.
  idx = header.findIndex(
    (h) =>
      ["tapşırıq", "tapşırığ", "task", "fəaliyyət", "görüləcək"].some((n) =>
        h.includes(n),
      ) && !h.includes("id"),
  );
  if (idx >= 0) return idx;
  // 3) Bare "iş" fallback, still excluding id columns.
  return header.findIndex((h) => h.includes("iş") && !h.includes("id"));
}

/**
 * Reads an arbitrary project workbook into the internal standard model:
 * every sheet as a grid, a best-effort metadata block, and a parsed task list
 * (found by locating a header row that contains a "task" column).
 */
export async function readWorkbook(absPath: string): Promise<ExcelModel> {
  return parseWorkbook(await loadWorkbook(absPath));
}

/** Parse an already-loaded workbook into the internal model (transport-agnostic). */
export function parseWorkbook(wb: ExcelJS.Workbook): ExcelModel {
  const sheets: ExcelSheet[] = [];
  const meta: Record<string, ExcelCellValue> = {};
  let tasks: ParsedTask[] = [];

  wb.eachSheet((ws) => {
    const rows: ExcelCellValue[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values: ExcelCellValue[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(normalizeCell(cell.value));
      });
      rows.push(values);
    });
    sheets.push({ name: ws.name, rows });

    // Metadata: rows shaped "Label:" | value in the first two columns.
    for (const r of rows) {
      const label = typeof r[0] === "string" ? r[0].trim() : "";
      if (label.endsWith(":") && r[1] != null && r[1] !== "") {
        meta[label.replace(/:$/, "")] = r[1];
      }
    }

    // Tasks: locate a header row, then read until a blank title.
    if (tasks.length === 0) {
      const headerIdx = rows.findIndex((r) => r.some(isTitleHeaderCell));
      if (headerIdx !== -1) {
        tasks = parseTasks(rows, headerIdx);
      }
    }
  });

  return { sheets, meta, tasks };
}

// Header predicates (all run on the AZ-safe lowercased header cell).
const isExpected = (h: string) =>
  /(gözlə|gozle|planla|plan|expected|nəzərdə|nezerde)/.test(h);
const isActual = (h: string) => /(faktiki|faktik|actual|real)/.test(h);
const isStartWord = (h: string) =>
  h.includes("başlama") || h.includes("baslama") || h.includes("start");
const isEndWord = (h: string) =>
  /(bitmə|bitme|son|end|due|deadline|təhvil|tehvil)/.test(h);
const isBudgetWord = (h: string) =>
  h.includes("büdcə") || h.includes("budce") || h.includes("budget");

function parseTasks(rows: ExcelCellValue[][], headerIdx: number): ParsedTask[] {
  const header = rows[headerIdx].map((c) => lc(c));
  const col = (names: string[]) =>
    header.findIndex((h) => names.some((n) => h.includes(n)));

  // Hourly-rate column ("Saatlıq Ödəniş") also contains "saat" — detect it first
  // so the hours-column search below can exclude it and never mistake a rate for
  // estimated hours.
  const rateCol = header.findIndex(
    (h) =>
      h.includes("saatlıq") ||
      h.includes("saatliq") ||
      h.includes("ödəniş") ||
      h.includes("odenis") ||
      h.includes("rate") ||
      h.includes("tarif") ||
      h.includes("hourly"),
  );

  // Hours: a sheet may have BOTH "Təxmini Saat" (estimated) and "Faktiki Saat"
  // (actual) — both contain "saat", so disambiguate before falling back, and
  // never pick the hourly-rate column.
  const actualHoursCol = header.findIndex(
    (h, i) => i !== rateCol && (h.includes("saat") || h.includes("hour")) && isActual(h),
  );
  const estHoursCol = (() => {
    const pref = header.findIndex(
      (h, i) =>
        i !== actualHoursCol &&
        i !== rateCol &&
        (h.includes("saat") || h.includes("hour")) &&
        /(təxmini|texmini|plan|estimat)/.test(h),
    );
    if (pref >= 0) return pref;
    return header.findIndex(
      (h, i) =>
        i !== actualHoursCol && i !== rateCol && (h.includes("saat") || h.includes("hour")),
    );
  })();

  // Dates: a complex sheet splits start/end into expected vs actual columns; a
  // simple sheet has one of each. Prefer the explicit expected/actual columns,
  // else fall back to the single column.
  const startExpCol = header.findIndex((h) => isStartWord(h) && isExpected(h));
  const startActCol = header.findIndex((h) => isStartWord(h) && isActual(h));
  const endExpCol = header.findIndex((h) => isEndWord(h) && isExpected(h));
  const endActCol = header.findIndex((h) => isEndWord(h) && isActual(h));
  const startAnyCol = header.findIndex(isStartWord);
  const endAnyCol = header.findIndex(isEndWord);
  const expStartCol = startExpCol >= 0 ? startExpCol : startActCol >= 0 ? -1 : startAnyCol;
  const expEndCol = endExpCol >= 0 ? endExpCol : endActCol >= 0 ? -1 : endAnyCol;

  // Budget: a complex sheet has İlkin (initial) + Yenilənmiş (updated); a simple
  // sheet has one. The "current" budget is the updated one when present.
  const budInitCol = header.findIndex(
    (h) => isBudgetWord(h) && /(ilkin|initial|əvvəl|evvel|ilk)/.test(h),
  );
  const budUpdCol = header.findIndex(
    (h) => isBudgetWord(h) && /(yenilə|yenile|updated|revised|cari)/.test(h),
  );
  const budAnyCol = header.findIndex(
    (h) =>
      isBudgetWord(h) ||
      h.includes("məbləğ") ||
      h.includes("mebleg") ||
      h.includes("dəyər") ||
      h.includes("deyer"),
  );
  const budgetCol = budUpdCol >= 0 ? budUpdCol : budInitCol >= 0 ? budInitCol : budAnyCol;

  const subIdCol = header.findIndex(
    (h) => h.includes("alt-id") || h.includes("alt id") || h.includes("altid"),
  );
  const idCol = (() => {
    const i = header.findIndex(
      (h) => h === "id" || h.includes("tapşırıq id") || h.includes("task id"),
    );
    if (i >= 0) return i;
    return header.findIndex(
      (h, k) =>
        h.includes("id") && k !== subIdCol && !h.includes("asıl") && !h.includes("depend"),
    );
  })();

  const ci = {
    id: idCol,
    subId: subIdCol,
    title: findTitleCol(header),
    // Primary responsible: "Məsul"/"İcraçı" but NOT the "İkinci İcraçı" column.
    assignee: header.findIndex(
      (h) => h.includes("məsul") || h.includes("assignee") || (h.includes("icraçı") && !h.includes("ikinci")),
    ),
    assignee2: header.findIndex(
      (h) =>
        h.includes("ikinci") ||
        h.includes("second") ||
        h.includes("köməkçi") ||
        h.includes("komekci"),
    ),
    dependsOn: header.findIndex(
      (h) => h.includes("asıl") || h.includes("asil") || h.includes("depend"),
    ),
    status: col(["status", "vəziyyət"]),
    priority: col(["prioritet", "priority", "önəm"]),
    expStart: expStartCol,
    actStart: startActCol,
    expEnd: expEndCol,
    actEnd: endActCol,
    hours: estHoursCol,
    actualHours: actualHoursCol,
    rate: rateCol,
    budget: budgetCol,
    initBudget: budInitCol,
    note: col(["qeyd", "note", "şərh"]),
  };
  const num = (v: ExcelCellValue): number | null =>
    typeof v === "number" ? v : null;
  const str = (i: number, r: ExcelCellValue[]): string => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const date = (i: number, r: ExcelCellValue[]): string | null => (i >= 0 ? asDate(r[i]) : null);
  const empty = (v: ExcelCellValue): boolean => v == null || String(v).trim() === "";

  const out: ParsedTask[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const title = ci.title >= 0 ? r[ci.title] : null;
    if (title == null || String(title).trim() === "") break;

    // Skip group/section-header rows (e.g. "P1 | İnfrastrukturun Qurulması").
    // In sheets with an Alt-ID column, a header row has a blank Alt-ID; more
    // generally, a header row carries a title but no assignee, status, hours or
    // budget — i.e. it is not an actual task.
    const emptyAt = (i: number) => i < 0 || empty(r[i]);
    const isGroupHeader =
      (ci.subId >= 0 && empty(r[ci.subId])) ||
      (emptyAt(ci.assignee) &&
        emptyAt(ci.assignee2) &&
        emptyAt(ci.status) &&
        emptyAt(ci.hours) &&
        emptyAt(ci.budget));
    if (isGroupHeader) continue;

    const expStart = date(ci.expStart, r);
    const actStart = date(ci.actStart, r);
    const expEnd = date(ci.expEnd, r);
    const actEnd = date(ci.actEnd, r);
    const budget = ci.budget >= 0 ? num(r[ci.budget]) : null;
    const initBudget = ci.initBudget >= 0 ? num(r[ci.initBudget]) : null;
    out.push({
      index: out.length + 1,
      id: str(ci.id, r),
      subId: str(ci.subId, r),
      title: String(title).trim(),
      assignee: str(ci.assignee, r),
      assignee2: str(ci.assignee2, r),
      dependsOn: str(ci.dependsOn, r),
      status: str(ci.status, r),
      priority: str(ci.priority, r),
      start: actStart ?? expStart,
      end: expEnd ?? actEnd,
      expectedStart: expStart,
      actualStart: actStart,
      expectedEnd: expEnd,
      actualEnd: actEnd,
      hours: ci.hours >= 0 ? num(r[ci.hours]) : null,
      actualHours: ci.actualHours >= 0 ? num(r[ci.actualHours]) : null,
      hourlyRate: ci.rate >= 0 ? num(r[ci.rate]) : null,
      budget,
      initialBudget: initBudget ?? (budUpdCol < 0 ? null : budget),
      note: str(ci.note, r),
    });
  }
  return out;
}

function asDate(v: ExcelCellValue): string | null {
  if (v == null || v === "") return null;
  return String(v);
}
