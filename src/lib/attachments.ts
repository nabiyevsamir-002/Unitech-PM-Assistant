import path from "node:path";
import fs from "node:fs/promises";

// Local filesystem storage for the demo. In production this becomes object
// storage (S3 / Azure Blob). Files live under uploads/ (gitignored).
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Strip anything path-like from a user-supplied filename. */
export function safeFileName(name: string): string {
  return path.basename(name).replace(/[^\w.\- ]/g, "_").slice(0, 120) || "file";
}

export function storagePathFor(id: string, fileName: string): string {
  // Stored on disk as "<id>__<safeName>" so ids never collide and the
  // original name is preserved for download.
  return `${id}__${safeFileName(fileName)}`;
}

export async function saveFile(relPath: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, relPath), bytes);
}

export async function readFileBytes(relPath: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOAD_DIR, path.basename(relPath)));
}

export async function removeFile(relPath: string): Promise<void> {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(relPath)));
  } catch {
    // already gone — ignore
  }
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
