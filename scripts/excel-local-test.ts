/**
 * Local end-to-end test of the Excel engine WITHOUT Microsoft. Exercises the
 * SAME read / anchor / compute / preview / backup / write-back code that the
 * OneDrive (Graph) path uses — only the transport differs. Proves the feature
 * on a real file today.
 *
 *   npx tsx scripts/excel-local-test.ts           # dry-run (read + preview only)
 *   npx tsx scripts/excel-local-test.ts --write    # actually apply (backup first)
 */
import { loadWorkbookFrom } from "../src/lib/excel/transport";
import { parseWorkbook, getCell } from "../src/lib/excel/read";
import { DEFAULT_ANCHORS } from "../src/lib/excel/anchors";
import {
  computeWritebackValues,
  buildWritebackPreview,
  applyWriteback,
} from "../src/lib/excel/writeback";

const FILE = "sample-data/azeribank-mobil.xlsx";
const WRITE = process.argv.includes("--write");

// The Excel stores AZ status words; the app computes counts from enum statuses.
// Exact-string match (no toLowerCase — Azerbaijani "İ" lowercases unreliably).
const STATUS_MAP: Record<string, string> = {
  "Tamamlandı": "DONE",
  "Tamamlanıb": "DONE",
  "İcrada": "IN_PROGRESS",
  "Yoxlamada": "REVIEW",
  "Görüləcək": "TODO",
  "Gözləmədə": "TODO",
};

async function main() {
  // ① READ
  console.log("① Fayl oxunur:", FILE);
  const wb = await loadWorkbookFrom(FILE);
  const model = parseWorkbook(wb);
  console.log(`   Vərəqlər: ${model.sheets.map((s) => s.name).join(", ")}`);
  console.log(`   Tapşırıqlar (${model.tasks.length}):`);
  model.tasks.forEach((t) =>
    console.log(`     • ${t.title} | ${t.assignee || "—"} | ${t.status} | bitmə: ${t.end ?? "—"}`),
  );

  console.log("\n   Cari anchor xanaları (proqramın sahiblədiyi xanalar):");
  for (const a of Object.values(DEFAULT_ANCHORS)) {
    console.log(`     ${a.label} (${a.sheet}!${a.cell}) = ${getCell(wb, a.sheet, a.cell)}`);
  }

  // ② COMPUTE — from the tasks (map Excel status words → app enums; due = end date)
  const tasks = model.tasks.map((t) => ({
    status: STATUS_MAP[String(t.status).trim()] ?? "TODO",
    dueDate: t.end,
  }));
  const values = computeWritebackValues("ACTIVE", tasks);
  console.log("\n② Proqramın hesabladığı dəyərlər:", JSON.stringify(values));

  // ③ PREVIEW (dry-run diff — nothing written)
  const preview = await buildWritebackPreview(FILE, DEFAULT_ANCHORS, values);
  const changed = preview.filter((p) => p.changed);
  console.log("\n③ Öncədən-baxış — dəyişəcək xanalar:");
  if (changed.length === 0) {
    console.log("     (dəyişiklik yoxdur — fayl artıq güncəldir)");
  } else {
    changed.forEach((p) =>
      console.log(`     ${p.label} (${p.sheet}!${p.cell}):  ${p.current}  →  ${p.next}`),
    );
  }

  if (!WRITE) {
    console.log("\nℹ️  Bu, quru test idi (heç nə yazılmadı). Həqiqətən yazmaq üçün: --write");
    return;
  }
  if (changed.length === 0) return;

  // ④ APPLY — backup first, then write ONLY the anchored cells
  const { backupPath, written } = await applyWriteback(FILE, DEFAULT_ANCHORS, values);
  console.log(`\n④ Yazıldı: ${written} xana.  Ehtiyat nüsxə: ${backupPath}`);

  // ⑤ VERIFY — re-read to confirm
  const wb2 = await loadWorkbookFrom(FILE);
  console.log("\n⑤ Təsdiq (fayl yenidən oxundu):");
  for (const a of Object.values(DEFAULT_ANCHORS)) {
    console.log(`     ${a.label} = ${getCell(wb2, a.sheet, a.cell)}`);
  }
  console.log("\n✅ Oxu → hesabla → preview → backup → yaz → təsdiq: HAMISI İŞLƏDİ (Microsoft olmadan).");
}

main().catch((e) => {
  console.error("Xəta:", e instanceof Error ? e.message : e);
  process.exit(1);
});
