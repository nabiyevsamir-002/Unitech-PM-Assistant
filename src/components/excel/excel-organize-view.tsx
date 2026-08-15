"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  Copy,
  Sparkles,
  Loader2,
  AlertCircle,
  ListChecks,
  CheckCircle2,
  Clock,
  CalendarClock,
  FolderPlus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/providers/i18n-provider";
import { importExcelProject } from "@/app/actions/projects";

type Stats = { total: number; done: number; overdue: number; dueToday: number };
type ImportTask = {
  title: string;
  assignee: string;
  status: string;
  priority: string;
  start: string | null;
  end: string | null;
  hours: number | null;
  actualHours: number | null;
  budget: number | null;
  note: string;
};
type Result = {
  ok: boolean;
  empty?: boolean;
  headers: string[];
  rows: string[][];
  tsv: string;
  insights: string;
  stats: Stats;
  tasks: ImportTask[];
  error?: string;
};

export function ExcelOrganizeView() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importedId, setImportedId] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setImportedId(null);
    setBusy(true);
    setFileName(file.name);
    setProjectName(file.name.replace(/\.xlsx$/i, "").trim());
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/excel/organize", { method: "POST", body: fd });
      const data = (await res.json()) as Result;
      if (!res.ok || !data.ok) {
        setError(data.error ?? t.excel.error);
      } else {
        setResult(data);
      }
    } catch {
      setError(t.excel.error);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!result || !projectName.trim() || importing) return;
    setImporting(true);
    try {
      const res = await importExcelProject(projectName.trim(), result.tasks);
      if (res.ok) {
        setImportedId(res.projectId ?? null);
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(t.excel.error);
    } finally {
      setImporting(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.excel.copied);
    } catch {
      toast.error(t.excel.error);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.excel.title}</h1>
        <p className="text-sm text-muted-foreground">{t.excel.subtitle}</p>
      </div>

      {/* Upload zone */}
      <Card>
        <CardContent className="py-6">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="size-6" />
            </div>
            <p className="text-sm text-muted-foreground">{t.excel.uploadHint}</p>
            {fileName && <p className="text-xs font-medium">{fileName}</p>}
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {busy ? t.excel.processing : result ? t.excel.reupload : t.excel.upload}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {result?.empty && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t.excel.noTasks}
        </div>
      )}

      {result && !result.empty && (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={ListChecks} label={t.excel.statTotal} value={result.stats.total} tone="default" />
            <StatTile icon={CheckCircle2} label={t.excel.statDone} value={result.stats.done} tone="ok" />
            <StatTile icon={Clock} label={t.excel.statOverdue} value={result.stats.overdue} tone="danger" />
            <StatTile icon={CalendarClock} label={t.excel.statDueToday} value={result.stats.dueToday} tone="warn" />
          </div>

          {/* Save as a managed project (import into the app) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderPlus className="size-4 text-primary" />
                {t.excel.importTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {importedId ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="size-4" /> {t.excel.imported}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>
                    {t.excel.viewProjects}
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t.excel.importHint}</p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="projName">{t.excel.projectNameLabel}</Label>
                      <Input
                        id="projName"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Layihə adı"
                      />
                    </div>
                    <Button onClick={doImport} disabled={importing || !projectName.trim()}>
                      {importing ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
                      {t.excel.importButton}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI analysis */}
          {result.insights && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  {t.excel.insightsTitle}
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => copy(result.insights)}>
                  <Copy className="size-3.5" />
                  {t.excel.copyInsights}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.insights}</div>
              </CardContent>
            </Card>
          )}

          {/* Organized table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {t.excel.tableTitle} · {result.stats.total} {t.excel.tasksFound}
              </CardTitle>
              <Button size="sm" onClick={() => copy(result.tsv)}>
                <Copy className="size-3.5" />
                {t.excel.copyTable}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {result.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        {r.map((c, j) => (
                          <td key={j} className="whitespace-nowrap px-3 py-2">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t.excel.copyHint}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "default" | "ok" | "danger" | "warn";
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-warning"
        : tone === "ok"
          ? "text-primary"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <Icon className={`size-5 ${toneCls}`} />
        <div>
          <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
