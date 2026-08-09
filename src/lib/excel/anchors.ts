import type { AnchorMap } from "./types";

/**
 * Default anchor map for the AzeriBank sample file. On first connect the app
 * suggests these and a human confirms them once; thereafter write-back ONLY
 * touches these exact cells (humans own everything else, e.g. the task rows).
 */
export const DEFAULT_ANCHORS: AnchorMap = {
  status: { sheet: "İzləmə", cell: "B7", label: "Layihə statusu" },
  progress: { sheet: "İzləmə", cell: "B10", label: "Ümumi irəliləyiş (%)" },
  lastUpdated: { sheet: "İzləmə", cell: "B11", label: "Son yenilənmə" },
  summaryTotal: { sheet: "Xülasə", cell: "B3", label: "Ümumi tapşırıq" },
  summaryDone: { sheet: "Xülasə", cell: "B4", label: "Tamamlanmış" },
  summaryInProgress: { sheet: "Xülasə", cell: "B5", label: "İcrada" },
  summaryOverdue: { sheet: "Xülasə", cell: "B6", label: "Gecikmiş" },
};

export function parseAnchors(json: string | null | undefined): AnchorMap {
  if (!json) return {};
  try {
    const obj = JSON.parse(json) as AnchorMap;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
