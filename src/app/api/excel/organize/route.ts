import { auth } from "@/auth";
import ExcelJS from "exceljs";
import { parseWorkbook } from "@/lib/excel/read";
import { analyzeTasks } from "@/lib/excel/analyze";
import { excelInsights } from "@/lib/ollama/agents";
import { formatDate } from "@/lib/format";
import type { ParsedTask } from "@/lib/excel/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const HEADERS = ["№", "Tapşırıq", "Məsul", "İkinci icraçı", "Status", "Prioritet", "Başlama", "Bitmə", "Təxmini saat", "Faktiki saat", "Büdcə (AZN)", "Asılılıq", "Qeyd"];

function toRow(t: ParsedTask): string[] {
  return [
    String(t.index),
    t.title,
    t.assignee,
    t.assignee2,
    t.status,
    t.priority,
    t.start ? formatDate(t.start) : "",
    t.end ? formatDate(t.end) : "",
    t.hours != null ? String(t.hours) : "",
    t.actualHours != null ? String(t.actualHours) : "",
    t.budget != null ? String(t.budget) : "",
    t.dependsOn,
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

  // All figures (stats, combined workload, budget totals, cost-vs-budget, date
  // & dependency anomalies) are computed in code; the model only narrates them.
  const { stats, grounding } = analyzeTasks(tasks);

  const insights = await excelInsights(grounding);

  // `tasks` (structured) lets the client offer "import as project" without re-upload.
  return Response.json({ ok: true, empty: false, headers: HEADERS, rows, tsv, insights, stats, tasks });
}
