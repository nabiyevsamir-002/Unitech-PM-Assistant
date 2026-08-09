// Microsoft Graph OneDrive/SharePoint drive-item transport (track 5d).
// `itemPath` is the Graph API path to the file item WITHOUT the trailing /content,
// e.g. "/drives/{driveId}/items/{itemId}" (this is what a `msgraph:` fileLocation
// stores after the prefix). Small-file (<4MB) simple upload — our workbooks are
// tiny; large files would need an upload session (future).

import { getGraphToken, GRAPH_BASE } from "./auth";

export { isGraphConfigured } from "./auth";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getGraphToken();
  return { Authorization: `Bearer ${token}` };
}

/** True if the drive item is reachable (metadata GET succeeds). */
export async function driveItemExists(itemPath: string): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH_BASE}${itemPath}`, {
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Download the item's bytes. Throws on failure. */
export async function downloadDriveItem(itemPath: string): Promise<Buffer> {
  const res = await fetch(`${GRAPH_BASE}${itemPath}/content`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Graph download failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Overwrite the item's content with `data`. Throws on failure. */
export async function uploadDriveItem(
  itemPath: string,
  data: Uint8Array,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}${itemPath}/content`, {
    method: "PUT",
    headers: { ...(await authHeaders()), "Content-Type": XLSX_MIME },
    body: data as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`Graph upload failed: ${res.status}`);
  }
}
