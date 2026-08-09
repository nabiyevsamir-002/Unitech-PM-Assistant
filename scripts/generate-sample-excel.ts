/**
 * Generates a realistic, deliberately AD-HOC project Excel file — the kind a PM
 * would hand-make, with a title, a metadata block, a task table that doesn't
 * start at A1, and a separate summary sheet. This is what the anchoring
 * approach is designed to handle (no standard format).
 *
 * Run: npx tsx scripts/generate-sample-excel.ts
 */
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UniTech PM (nümunə)";
  wb.created = new Date("2026-06-27T09:00:00+04:00");

  // ---- Sheet 1: İzləmə (Tracking) ----
  const ws = wb.addWorksheet("İzləmə", {
    views: [{ showGridLines: true }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 12;
  ws.getColumn(8).width = 8;
  ws.getColumn(9).width = 30;

  // Title (merged)
  ws.mergeCells("A1:I1");
  const title = ws.getCell("A1");
  title.value = "AzeriBank Mobil Bankçılıq — Layihə İzləmə Cədvəli";
  title.font = { bold: true, size: 14 };
  title.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 26;

  // Metadata block (label in A, value in B) — note the irregular layout.
  const meta: [string, string, ExcelJS.CellValue][] = [
    ["A3", "Müştəri:", "AzeriBank ASC"],
    ["A4", "Layihə meneceri:", "Samir Nəbiyev"],
    ["A5", "Başlama tarixi:", new Date("2026-06-27")],
    ["A6", "Planlaşdırılan bitmə:", new Date("2026-09-10")],
    ["A7", "Status:", "Aktiv"],
    ["A8", "Büdcə (AZN):", 45000],
  ];
  for (const [addr, label, value] of meta) {
    ws.getCell(addr).value = label;
    ws.getCell(addr).font = { bold: true };
    const valAddr = addr.replace("A", "B");
    ws.getCell(valAddr).value = value;
  }

  // System-owned summary cells (these are the anchored, write-back targets).
  ws.getCell("A10").value = "Ümumi irəliləyiş (%):";
  ws.getCell("A10").font = { bold: true };
  ws.getCell("B10").value = 40; // will be recomputed & written back by the app
  ws.getCell("A11").value = "Son yenilənmə:";
  ws.getCell("A11").font = { bold: true };
  ws.getCell("B11").value = new Date("2026-07-20");

  // Task table header at row 13.
  const header = ["№", "Tapşırıq", "Məsul", "Status", "Prioritet", "Başlama", "Bitmə", "Saat", "Qeyd"];
  const headerRow = ws.getRow(13);
  header.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    c.alignment = { horizontal: "center" };
  });

  const tasks: (string | number | Date)[][] = [
    [1, "Tələblərin toplanması", "Samir Nəbiyev", "Tamamlandı", "Yüksək", new Date("2026-06-27"), new Date("2026-07-07"), 16, ""],
    [2, "UI/UX dizaynı", "Leyla Rəhimova", "Tamamlandı", "Orta", new Date("2026-07-07"), new Date("2026-07-22"), 24, ""],
    [3, "Giriş və identifikasiya modulu", "Nigar Hüseynova", "İcrada", "Yüksək", new Date("2026-07-22"), new Date("2026-08-09"), 20, ""],
    [4, "Kart əməliyyatları API", "Samir Nəbiyev", "İcrada", "Təcili", new Date("2026-07-25"), new Date("2026-08-05"), 30, "Gecikmə riski"],
    [5, "Ödəniş inteqrasiyası testi", "Elvin Quliyev", "Yoxlamada", "Yüksək", new Date("2026-08-01"), new Date("2026-08-11"), 12, ""],
    [6, "Push bildiriş sistemi", "Nigar Hüseynova", "Görüləcək", "Orta", new Date("2026-08-10"), new Date("2026-08-16"), 14, ""],
    [7, "App Store yayımı", "", "Görüləcək", "Aşağı", new Date("2026-08-20"), new Date("2026-09-05"), 6, ""],
  ];
  tasks.forEach((row, i) => {
    const r = ws.getRow(14 + i);
    row.forEach((val, ci) => {
      r.getCell(ci + 1).value = val as ExcelJS.CellValue;
    });
  });

  // ---- Sheet 2: Xülasə (Summary) — also holds anchored write-back cells ----
  const sum = wb.addWorksheet("Xülasə");
  sum.getColumn(1).width = 24;
  sum.getColumn(2).width = 12;
  sum.mergeCells("A1:B1");
  sum.getCell("A1").value = "Statistika";
  sum.getCell("A1").font = { bold: true, size: 12 };
  const rows: [string, string, number][] = [
    ["A3", "Ümumi tapşırıq:", 7],
    ["A4", "Tamamlanmış:", 2],
    ["A5", "İcrada:", 2],
    ["A6", "Gecikmiş:", 1],
  ];
  for (const [addr, label, value] of rows) {
    sum.getCell(addr).value = label;
    sum.getCell(addr).font = { bold: true };
    sum.getCell(addr.replace("A", "B")).value = value;
  }

  const outDir = path.join(process.cwd(), "sample-data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "azeribank-mobil.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log("Wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
