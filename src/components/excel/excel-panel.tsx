"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileSpreadsheet,
  RefreshCw,
  Upload,
  ArrowRight,
  CheckCircle2,
  Anchor as AnchorIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { syncExcel, proposeExcelWriteback } from "@/app/actions/excel";
import type { ExcelModel, WritebackItem } from "@/lib/excel/types";

type AnchorValue = {
  field: string;
  label: string;
  sheet: string;
  cell: string;
  value: unknown;
};

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  // ISO date → dd.mm.yyyy
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}

export function ExcelPanel({
  projectId,
  fileLocation,
}: {
  projectId: string;
  fileLocation: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [model, setModel] = useState<ExcelModel | null>(null);
  const [anchorValues, setAnchorValues] = useState<AnchorValue[]>([]);
  const [preview, setPreview] = useState<WritebackItem[] | null>(null);

  const doSync = () =>
    startTransition(async () => {
      const res = await syncExcel(projectId);
      if (res.ok && res.model) {
        setModel(res.model);
        setAnchorValues((res.anchorValues as AnchorValue[]) ?? []);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });

  const doPropose = () =>
    startTransition(async () => {
      const res = await proposeExcelWriteback(projectId);
      if (res.ok) {
        setPreview(res.preview ?? []);
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4.5 text-success" />
          Excel inteqrasiyası
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={doSync} disabled={pending}>
            <RefreshCw className={cn("size-4", pending && "animate-spin")} />
            <span className="hidden sm:inline">Excel-i oxu</span>
          </Button>
          <Button size="sm" onClick={doPropose} disabled={pending}>
            <Upload className="size-4" />
            <span className="hidden sm:inline">Geri-yazma təklif et</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5 font-mono">
            {fileLocation ?? "—"}
          </span>
        </p>

        {/* Anchors + their current file values */}
        {anchorValues.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <AnchorIcon className="size-4 text-primary" />
              Çövrələnmiş xanalar (sistem sahibidir)
            </h4>
            <div className="overflow-hidden rounded-lg border">
              {anchorValues.map((a, i) => (
                <div
                  key={a.field}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm",
                    i > 0 && "border-t",
                  )}
                >
                  <span className="flex-1 truncate">{a.label}</span>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {a.sheet}!{a.cell}
                  </Badge>
                  <span className="w-24 text-right font-medium tabular-nums">
                    {fmt(a.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parsed internal model — tasks read from the file */}
        {model && (
          <div>
            <h4 className="mb-2 text-sm font-medium">
              Daxili model — fayldan oxunan tapşırıqlar ({model.tasks.length})
            </h4>
            <div className="overflow-x-auto thin-scrollbar rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Tapşırıq</th>
                    <th className="px-3 py-2 text-left font-medium">Məsul</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Bitmə</th>
                  </tr>
                </thead>
                <tbody>
                  {model.tasks.map((tk) => (
                    <tr key={tk.index} className="border-t">
                      <td className="px-3 py-2">{tk.title}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {tk.assignee || "—"}
                      </td>
                      <td className="px-3 py-2">{tk.status}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmt(tk.end)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Write-back preview (dry-run) */}
        {preview && (
          <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <CheckCircle2 className="size-4 text-primary" />
              Təklif olunan geri-yazma (təsdiq gözləyir)
            </h4>
            <div className="space-y-1.5">
              {preview
                .filter((p) => p.changed)
                .map((p) => (
                  <div
                    key={p.field}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="flex-1 truncate">{p.label}</span>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {p.sheet}!{p.cell}
                    </Badge>
                    <span className="text-muted-foreground line-through">
                      {fmt(p.current)}
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold text-primary">
                      {fmt(p.next)}
                    </span>
                  </div>
                ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Bu təklif{" "}
              <Link href="/approvals" className="font-medium text-primary hover:underline">
                Təsdiqlər
              </Link>{" "}
              bölməsinə əlavə olundu. Təsdiqdən sonra fayl ehtiyat nüsxələnib
              yenilənəcək.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
