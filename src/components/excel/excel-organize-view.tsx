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
  CheckCircle2,
  FolderPlus,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type JobStatus = "queued" | "analyzing" | "done" | "error";
type Job = {
  id: string;
  fileName: string;
  file: File;
  status: JobStatus;
  result: Result | null;
  error: string | null;
  projectName: string;
  importing: boolean;
  importedId: string | null;
  open: boolean;
};

export function ExcelOrganizeView() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef<Job[]>([]);
  const pumping = useRef(false);

  // The ref is the source of truth for the sequential pump; update it
  // SYNCHRONOUSLY (React's setState updater runs async, so a ref written inside
  // it would still be stale when pump() runs right after addFiles).
  const setJobsSynced = (updater: (prev: Job[]) => Job[]) => {
    const next = updater(jobsRef.current);
    jobsRef.current = next;
    setJobs(next);
  };
  const patchJob = (id: string, patch: Partial<Job>) =>
    setJobsSynced((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  // Process queued jobs strictly one at a time (the model handles one file at a
  // time; results appear as each finishes).
  const pump = async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const next = jobsRef.current.find((j) => j.status === "queued");
        if (!next) break;
        patchJob(next.id, { status: "analyzing" });
        try {
          const fd = new FormData();
          fd.append("file", next.file);
          const res = await fetch("/api/excel/organize", { method: "POST", body: fd });
          const data = (await res.json()) as Result;
          if (!res.ok || !data.ok) {
            patchJob(next.id, { status: "error", error: data.error ?? t.excel.error });
          } else {
            patchJob(next.id, { status: "done", result: data });
          }
        } catch {
          patchJob(next.id, { status: "error", error: t.excel.error });
        }
      }
    } finally {
      pumping.current = false;
    }
  };

  const addFiles = (files: File[]) => {
    const xlsx = files.filter((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (xlsx.length === 0) {
      toast.error(t.excel.error);
      return;
    }
    const newJobs: Job[] = xlsx.map((f) => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      file: f,
      status: "queued",
      result: null,
      error: null,
      projectName: f.name.replace(/\.xlsx$/i, "").trim(),
      importing: false,
      importedId: null,
      open: xlsx.length === 1, // auto-expand when a single file is uploaded
    }));
    setJobsSynced((prev) => [...prev, ...newJobs]);
    void pump();
  };

  const doImport = async (id: string) => {
    const job = jobsRef.current.find((j) => j.id === id);
    if (!job || !job.result || !job.projectName.trim() || job.importing || job.importedId) return;
    patchJob(id, { importing: true });
    try {
      const res = await importExcelProject(job.projectName.trim(), job.result.tasks);
      if (res.ok) {
        patchJob(id, { importedId: res.projectId ?? "saved", importing: false });
        toast.success(res.message);
        router.refresh();
      } else {
        patchJob(id, { importing: false });
        toast.error(res.message);
      }
    } catch {
      patchJob(id, { importing: false });
      toast.error(t.excel.error);
    }
  };

  const saveAll = async () => {
    for (const j of jobsRef.current) {
      if (j.status === "done" && !j.importedId && j.result && !j.result.empty && j.projectName.trim()) {
        await doImport(j.id);
      }
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

  const analyzedCount = jobs.filter((j) => j.status === "done" || j.status === "error").length;
  const savableCount = jobs.filter(
    (j) => j.status === "done" && !j.importedId && j.result && !j.result.empty,
  ).length;
  const savedCount = jobs.filter((j) => j.importedId).length;
  const busy = jobs.some((j) => j.status === "queued" || j.status === "analyzing");

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
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length) addFiles(fs);
              e.target.value = "";
            }}
          />
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const fs = Array.from(e.dataTransfer.files ?? []);
              if (fs.length) addFiles(fs);
            }}
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="size-6" />
            </div>
            <p className="text-sm text-muted-foreground">{t.excel.uploadHint}</p>
            <Button onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" />
              {jobs.length ? t.excel.reupload : t.excel.upload}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue summary + save-all */}
      {jobs.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm">
            {busy && <Loader2 className="size-4 animate-spin text-primary" />}
            <span className="font-medium">
              {analyzedCount}/{jobs.length}
            </span>{" "}
            {t.excel.analyzedOf}
            {savedCount > 0 && (
              <span className="text-success">
                {" "}
                · {savedCount} {t.excel.savedSuffix}
              </span>
            )}
          </p>
          {savableCount > 0 && (
            <Button size="sm" onClick={saveAll}>
              <FolderPlus className="size-4" />
              {t.excel.saveAll} ({savableCount})
            </Button>
          )}
        </div>
      )}

      {/* One card per file */}
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          t={t}
          onName={(v) => patchJob(job.id, { projectName: v })}
          onToggle={() => patchJob(job.id, { open: !job.open })}
          onSave={() => doImport(job.id)}
          onCopy={copy}
          onViewProjects={() => router.push("/projects")}
        />
      ))}
    </div>
  );
}

function JobCard({
  job,
  t,
  onName,
  onToggle,
  onSave,
  onCopy,
  onViewProjects,
}: {
  job: Job;
  t: ReturnType<typeof useI18n>["t"];
  onName: (v: string) => void;
  onToggle: () => void;
  onSave: () => void;
  onCopy: (text: string) => void;
  onViewProjects: () => void;
}) {
  const r = job.result;
  const empty = job.status === "done" && (r?.empty || !r);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <FileSpreadsheet className="size-4 shrink-0 text-primary" />
          <span className="truncate">{job.fileName}</span>
        </CardTitle>
        <StatusBadge job={job} t={t} />
      </CardHeader>

      <CardContent className="space-y-3">
        {job.status === "error" && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" /> {job.error ?? t.excel.error}
          </div>
        )}

        {empty && (
          <div className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
            {t.excel.noTasks}
          </div>
        )}

        {job.status === "done" && r && !r.empty && (
          <>
            {/* Compact stat line */}
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{r.stats.total}</span> {t.excel.tasksFound} ·{" "}
              {r.stats.done} {t.excel.statDone.toLowerCase()} ·{" "}
              <span className={r.stats.overdue ? "text-destructive" : ""}>
                {r.stats.overdue} {t.excel.statOverdue.toLowerCase()}
              </span>
            </p>

            {/* Save as project */}
            {job.importedId ? (
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-4" /> {t.excel.imported}
                </p>
                <Button variant="outline" size="sm" onClick={onViewProjects}>
                  {t.excel.viewProjects}
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input value={job.projectName} onChange={(e) => onName(e.target.value)} placeholder="Layihə adı" />
                </div>
                <Button onClick={onSave} disabled={job.importing || !job.projectName.trim()}>
                  {job.importing ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
                  {t.excel.importButton}
                </Button>
              </div>
            )}

            {/* Expandable details: AI analysis + table */}
            <button
              type="button"
              onClick={onToggle}
              className="flex items-center gap-1 text-sm font-medium text-primary"
            >
              {job.open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {job.open ? t.excel.hideDetails : t.excel.details}
            </button>

            {job.open && (
              <div className="space-y-3">
                {r.insights && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4 text-primary" />
                        {t.excel.insightsTitle}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => onCopy(r.insights)}>
                        <Copy className="size-3.5" />
                        {t.excel.copyInsights}
                      </Button>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{r.insights}</div>
                  </div>
                )}

                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-sm font-medium">{t.excel.tableTitle}</span>
                    <Button size="sm" onClick={() => onCopy(r.tsv)}>
                      <Copy className="size-3.5" />
                      {t.excel.copyTable}
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {r.headers.map((h) => (
                            <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.rows.map((row, i) => (
                          <tr key={i} className="border-t">
                            {row.map((c, j) => (
                              <td key={j} className="whitespace-nowrap px-3 py-2">
                                {c}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t.excel.copyHint}</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ job, t }: { job: Job; t: ReturnType<typeof useI18n>["t"] }) {
  if (job.status === "queued")
    return <span className="shrink-0 text-xs text-muted-foreground">{t.excel.queued}</span>;
  if (job.status === "analyzing")
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-primary">
        <Loader2 className="size-3.5 animate-spin" /> {t.excel.analyzing}
      </span>
    );
  if (job.status === "error")
    return <span className="shrink-0 text-xs font-medium text-destructive">{t.excel.failedShort}</span>;
  return <CheckCircle2 className="size-4 shrink-0 text-success" />;
}
