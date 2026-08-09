// Excel file transport (track 5d): routes read/write/backup between the local
// filesystem and Microsoft Graph (OneDrive/SharePoint) based on the stored
// fileLocation. A Graph source is stored as "msgraph:/drives/{driveId}/items/{itemId}".
// The local branch is byte-identical to the original FS-only behaviour.

import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveExcelPath } from "./read";
import {
  downloadDriveItem,
  uploadDriveItem,
  driveItemExists,
} from "@/lib/graph/drive";

const GRAPH_PREFIX = "msgraph:";

export function isGraphLocation(loc: string): boolean {
  return loc.startsWith(GRAPH_PREFIX);
}
function graphItemPath(loc: string): string {
  return loc.slice(GRAPH_PREFIX.length);
}

/** Does the source exist / is it reachable? */
export async function sourceExists(fileLocation: string): Promise<boolean> {
  if (isGraphLocation(fileLocation)) {
    return driveItemExists(graphItemPath(fileLocation));
  }
  return existsSync(resolveExcelPath(fileLocation));
}

/** Load a workbook from either transport. */
export async function loadWorkbookFrom(
  fileLocation: string,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (isGraphLocation(fileLocation)) {
    const buf = await downloadDriveItem(graphItemPath(fileLocation));
    // Cast bridges @types/node's generic Buffer vs ExcelJS's Buffer param type.
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } else {
    await wb.xlsx.readFile(resolveExcelPath(fileLocation));
  }
  return wb;
}

/** Save a workbook back to either transport. */
export async function saveWorkbookTo(
  fileLocation: string,
  wb: ExcelJS.Workbook,
): Promise<void> {
  if (isGraphLocation(fileLocation)) {
    // ExcelJS returns a Node Buffer (a Uint8Array subclass) — usable as a fetch body.
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
    await uploadDriveItem(graphItemPath(fileLocation), buf);
  } else {
    await wb.xlsx.writeFile(resolveExcelPath(fileLocation));
  }
}

/**
 * Back up the current bytes locally before a write-back (ALWAYS local, even for a
 * Graph source — a durable safety copy lives in sample-data/backups). Returns path.
 */
export async function backupWorkbook(fileLocation: string): Promise<string> {
  const dir = path.join(process.cwd(), "sample-data", "backups");
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (isGraphLocation(fileLocation)) {
    const buf = await downloadDriveItem(graphItemPath(fileLocation));
    const safe = graphItemPath(fileLocation).replace(/[^a-zA-Z0-9]+/g, "_").slice(-48);
    const backupPath = path.join(dir, `graph${safe}.${stamp}.xlsx`);
    await fs.writeFile(backupPath, buf);
    return backupPath;
  }

  const abs = resolveExcelPath(fileLocation);
  const base = path.basename(abs, ".xlsx");
  const backupPath = path.join(dir, `${base}.${stamp}.xlsx`);
  await fs.copyFile(abs, backupPath);
  return backupPath;
}
