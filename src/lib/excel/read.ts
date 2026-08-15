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

function parseTasks(rows: ExcelCellValue[][], headerIdx: number): ParsedTask[] {
  const header = rows[headerIdx].map((c) => lc(c));
  const col = (names: string[]) =>
    header.findIndex((h) => names.some((n) => h.includes(n)));

  const ci = {
    title: findTitleCol(header),
    assignee: col(["məsul", "icraçı", "assignee"]),
    status: col(["status", "vəziyyət"]),
    priority: col(["prioritet", "priority", "önəm"]),
    start: col(["başlama", "start"]),
    end: col(["bitmə", "son", "end", "due", "deadline"]),
    hours: col(["saat", "hour"]),
    note: col(["qeyd", "note", "şərh"]),
  };

  const out: ParsedTask[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const title = ci.title >= 0 ? r[ci.title] : null;
    if (title == null || String(title).trim() === "") break;
    out.push({
      index: out.length + 1,
      title: String(title),
      assignee: ci.assignee >= 0 ? String(r[ci.assignee] ?? "") : "",
      status: ci.status >= 0 ? String(r[ci.status] ?? "") : "",
      priority: ci.priority >= 0 ? String(r[ci.priority] ?? "") : "",
      start: ci.start >= 0 ? asDate(r[ci.start]) : null,
      end: ci.end >= 0 ? asDate(r[ci.end]) : null,
      hours: ci.hours >= 0 && typeof r[ci.hours] === "number" ? (r[ci.hours] as number) : null,
      note: ci.note >= 0 ? String(r[ci.note] ?? "") : "",
    });
  }
  return out;
}

function asDate(v: ExcelCellValue): string | null {
  if (v == null || v === "") return null;
  return String(v);
}
