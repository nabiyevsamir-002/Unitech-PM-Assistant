import { auth } from "@/auth";
import ExcelJS from "exceljs";
import { parseWorkbook } from "@/lib/excel/read";
import { excelInsights } from "@/lib/ollama/agents";
import { isOverdue, isDueToday, formatDate } from "@/lib/format";
import type { ParsedTask } from "@/lib/excel/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Best-effort "is this task finished" check across common AZ/EN status words.
const DONE_WORDS = ["tamamland", "tamamlan", "bitdi", "hazır", "done", "completed", "closed"];
function isDone(status: string): boolean {
  const s = String(status).trim().toLowerCase();
  return DONE_WORDS.some((w) => s.includes(w));
}

const HEADERS = ["№", "Tapşırıq", "Məsul", "Status", "Prioritet", "Başlama", "Bitmə", "Saat", "Qeyd"];

function toRow(t: ParsedTask): string[] {
  return [
    String(t.index),
    t.title,
    t.assignee,
    t.status,
    t.priority,
    t.start ? formatDate(t.start) : "",
    t.end ? formatDate(t.end) : "",
    t.hours != null ? String(t.hours) : "",
    t.note,
  ];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Fayl oxunmadı." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Excel faylı seçilməyib." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return Response.json({ ok: false, error: "Yalnız .xlsx faylı dəstəklənir." }, { status: 400 });
  }

  let tasks: ParsedTask[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    tasks = parseWorkbook(wb).tasks;
  } catch {
    return Response.json(
      { ok: false, error: "Excel oxunarkən xəta baş verdi. Fayl zədəli və ya bağlı ola bilər." },
      { status: 400 },
    );
  }

  const emptyStats = { total: 0, done: 0, overdue: 0, dueToday: 0 };
  if (tasks.length === 0) {
    return Response.json({
      ok: true,
      empty: true,
      headers: HEADERS,
      rows: [],
      tsv: HEADERS.join("\t"),
      insights: "",
      stats: emptyStats,
      tasks: [],
    });
  }

  const rows = tasks.map(toRow);
  const tsv = [HEADERS, ...rows].map((r) => r.join("\t")).join("\n");

  const notDone = tasks.filter((t) => !isDone(t.status));
  const overdue = notDone.filter((t) => isOverdue(t.end));
  const dueToday = notDone.filter((t) => isDueToday(t.end));
  const stats = {
    total: tasks.length,
    done: tasks.length - notDone.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
  };

  // Grounding text — numbers computed here, the model only narrates them.
  const lines: string[] = [];
  lines.push(`Bugünkü tarix: ${formatDate(new Date().toISOString())} (Bakı vaxtı).`);
  lines.push(
    `Statistika: ümumi ${stats.total}, tamamlanmış ${stats.done}, gecikmiş ${stats.overdue}, bu gün bitən ${stats.dueToday}.`,
  );
  lines.push("Tapşırıqlar:");
  for (const t of tasks) {
    const flags: string[] = [];
    if (!isDone(t.status) && isOverdue(t.end)) flags.push("GECİKİB");
    else if (!isDone(t.status) && isDueToday(t.end)) flags.push("BUGÜN BİTİR");
    lines.push(
      `- ${t.title} | məsul: ${t.assignee || "təyin edilməyib"} | status: ${t.status || "—"} | prioritet: ${t.priority || "—"} | bitmə: ${t.end ? formatDate(t.end) : "—"}${flags.length ? " [" + flags.join(", ") + "]" : ""}`,
    );
  }

  const insights = await excelInsights(lines.join("\n"));

  // `tasks` (structured) lets the client offer "import as project" without re-upload.
  return Response.json({ ok: true, empty: false, headers: HEADERS, rows, tsv, insights, stats, tasks });
}
