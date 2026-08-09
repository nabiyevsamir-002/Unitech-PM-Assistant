import ExcelJS from "exceljs";
import { getCell, normalizeCell } from "./read";
import { loadWorkbookFrom, saveWorkbookTo, backupWorkbook } from "./transport";
import type { AnchorMap, ExcelCellValue, WritebackItem } from "./types";
import { formatDate } from "@/lib/format";
import { isOverdue } from "@/lib/format";

const STATUS_AZ: Record<string, string> = {
  ACTIVE: "Aktiv",
  ON_HOLD: "Gözləmədə",
  COMPLETED: "Tamamlanıb",
  ARCHIVED: "Arxivləşdirilib",
};

export type ProjectSnapshotTask = {
  status: string;
  dueDate: string | null;
};

/** Deterministically compute the values the app owns and writes back. */
export function computeWritebackValues(
  projectStatus: string,
  tasks: ProjectSnapshotTask[],
): Record<string, ExcelCellValue> {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const inProgress = tasks.filter(
    (t) => t.status === "IN_PROGRESS" || t.status === "REVIEW",
  ).length;
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && isOverdue(t.dueDate),
  ).length;

  return {
    status: STATUS_AZ[projectStatus] ?? projectStatus,
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
    lastUpdated: formatDate(new Date().toISOString()),
    summaryTotal: total,
    summaryDone: done,
    summaryInProgress: inProgress,
    summaryOverdue: overdue,
  };
}

/** Build a dry-run diff (current cell → proposed value) without writing. */
export async function buildWritebackPreview(
  fileLocation: string,
  anchors: AnchorMap,
  values: Record<string, ExcelCellValue>,
): Promise<WritebackItem[]> {
  const wb = await loadWorkbookFrom(fileLocation);
  const items: WritebackItem[] = [];

  for (const [field, anchor] of Object.entries(anchors)) {
    if (!(field in values)) continue;
    const current = getCell(wb, anchor.sheet, anchor.cell);
    const next = values[field];
    items.push({
      field,
      label: anchor.label,
      sheet: anchor.sheet,
      cell: anchor.cell,
      current,
      next,
      changed: String(current ?? "") !== String(next ?? ""),
    });
  }
  return items;
}

/** Timestamped backup of the current file bytes (local or Graph). Returns path. */
export async function backupFile(fileLocation: string): Promise<string> {
  return backupWorkbook(fileLocation);
}

/**
 * Applies the write-back: ALWAYS backs up first, then writes ONLY the anchored
 * cells (never anything else), then saves via the source's transport. Returns
 * the backup path. Works for both local files and Graph (OneDrive) sources.
 */
export async function applyWriteback(
  fileLocation: string,
  anchors: AnchorMap,
  values: Record<string, ExcelCellValue>,
): Promise<{ backupPath: string; written: number }> {
  const backupPath = await backupWorkbook(fileLocation);

  const wb = await loadWorkbookFrom(fileLocation);
  let written = 0;
  for (const [field, anchor] of Object.entries(anchors)) {
    if (!(field in values)) continue;
    const ws = wb.getWorksheet(anchor.sheet);
    if (!ws) continue;
    const raw = values[field];
    ws.getCell(anchor.cell).value = raw as ExcelJS.CellValue;
    written++;
  }
  await saveWorkbookTo(fileLocation, wb);
  return { backupPath, written };
}

export { normalizeCell };
