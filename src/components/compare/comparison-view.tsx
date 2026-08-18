"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatDate } from "@/lib/format";
import type { ProjectComparison } from "@/lib/reports/comparison";

const BAND = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
} as const;
const BAND_TEXT = {
  good: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
} as const;

function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-1.5 w-full min-w-14 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", className)}
        style={{ width: `${Math.max(pct, 3)}%` }}
      />
    </div>
  );
}

export function ComparisonView({ rows }: { rows: ProjectComparison[] }) {
  const { t } = useI18n();
  // Worst health first — the projects that need attention lead.
  const sorted = [...rows].sort((a, b) => a.score - b.score);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/dashboard"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.dashboard.cmpBack}
        </Link>
        <h1 className="text-2xl font-semibold">{t.dashboard.cmpTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.cmpSubtitle}</p>
      </div>

      {sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t.dashboard.cmpEmpty}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">{t.dashboard.cmpProject}</th>
                  <th className="px-4 py-3">{t.dashboard.cmpHealth}</th>
                  <th className="px-4 py-3">{t.dashboard.cmpProgress}</th>
                  <th className="px-4 py-3 text-right">{t.dashboard.overdue}</th>
                  <th className="px-4 py-3 text-right">{t.dashboard.cmpBudget}</th>
                  <th className="px-4 py-3 text-right">{t.dashboard.cmpSpent}</th>
                  <th className="px-4 py-3 text-right">{t.dashboard.cmpTeam}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{t.dashboard.cmpDue}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((r) => (
                  <tr key={r.projectId} className="hover:bg-accent/30">
                    <td className="max-w-52 px-4 py-3">
                      <Link
                        href="/projects"
                        className="line-clamp-2 font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-7 shrink-0 font-semibold tabular-nums", BAND_TEXT[r.band])}>
                          {r.score}
                        </span>
                        <Bar pct={r.score} className={BAND[r.band]} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {r.progress}%
                        </span>
                        <Bar pct={r.progress} className="bg-primary" />
                      </div>
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular-nums", r.overdueCount > 0 && "font-semibold text-destructive")}>
                      {r.overdueCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {r.budgetTotal ? r.budgetTotal.toLocaleString() : "—"}
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular-nums whitespace-nowrap", r.budgetTotal > 0 && r.budgetSpent > r.budgetTotal && "font-semibold text-destructive")}>
                      {r.budgetSpent ? r.budgetSpent.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.teamSize || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {r.dueDate ? formatDate(r.dueDate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
