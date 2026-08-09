"use client";

import { useState, useTransition } from "react";
import { Sparkles, TrendingUp, Users, AlertTriangle, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { sendWeeklyReportNowAction } from "@/app/actions/notify";
import type { WorkloadDTO } from "@/lib/types";
import type { BillableSummary } from "@/lib/data";

const STATUS_COLOR: Record<string, string> = {
  TODO: "bg-status-todo",
  IN_PROGRESS: "bg-status-progress",
  REVIEW: "bg-status-review",
  DONE: "bg-status-done",
};

export function ReportsView({
  workload,
  statusCounts,
  overdueCount,
  totalTasks,
  billable,
  canEmailReport = false,
}: {
  workload: WorkloadDTO[];
  statusCounts: Record<string, number>;
  overdueCount: number;
  totalTasks: number;
  billable: BillableSummary;
  canEmailReport?: boolean;
}) {
  const { t, lang } = useI18n();
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailing, startEmail] = useTransition();

  const emailReport = () =>
    startEmail(async () => {
      const res = await sendWeeklyReportNowAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });

  const generate = async () => {
    setLoading(true);
    setReport("");
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok || !res.body) throw new Error("offline");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setReport(acc);
      }
    } catch {
      setReport(t.settings.aiOfflineHint);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.reports.title}</h1>
          <p className="text-sm text-muted-foreground">{t.reports.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEmailReport && (
            <Button
              variant="outline"
              onClick={emailReport}
              disabled={emailing}
              title={t.reports.emailReportHint}
            >
              <Mail className="size-4" />
              {emailing ? t.reports.emailing : t.reports.emailReport}
            </Button>
          )}
          <Button onClick={generate} disabled={loading}>
            <Sparkles className="size-4" />
            {loading ? t.reports.generating : t.reports.generate}
          </Button>
        </div>
      </div>

      {(report || loading) && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4.5 text-primary" />
              {t.ai.agentReporting}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {report || t.ai.thinking}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Workload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4.5 text-primary" />
              {t.reports.workload}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workload.map((w) => {
              const pct = w.capacity > 0 ? (w.assignedHours / w.capacity) * 100 : 0;
              const over = pct > 100;
              return (
                <div key={w.userId} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={w.name}
                      image={w.avatar}
                      className="size-6 text-[10px]"
                    />
                    <span className="text-sm font-medium">{w.name}</span>
                    <span
                      className={cn(
                        "ml-auto text-xs tabular-nums",
                        over ? "font-semibold text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {w.assignedHours}s / {w.capacity}s · {w.openTasks} {t.projects.tasksCount}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(pct, 100)}
                    className={cn("h-1.5", over && "[&>div]:bg-destructive")}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Tasks by status + health */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4.5 text-primary" />
                {t.reports.tasksByStatus}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(statusCounts).map(([status, count]) => {
                const pct = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{(t.status as Record<string, string>)[status]}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", STATUS_COLOR[status])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card
            className={cn(
              overdueCount > 0 && "border-destructive/30 bg-destructive/[0.03]",
            )}
          >
            <CardContent className="flex items-center gap-3 p-5">
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl",
                  overdueCount > 0
                    ? "bg-destructive/12 text-destructive"
                    : "bg-success/12 text-success",
                )}
              >
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">{t.reports.riskSummary}</p>
                <p className="text-sm text-muted-foreground">
                  {overdueCount > 0
                    ? `${overdueCount} ${t.dashboard.overdue.toLowerCase()}`
                    : t.common.none}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Billable / logged hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4.5 text-primary" />
            {t.time.billable}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              <span className="text-2xl font-semibold tabular-nums">
                {billable.totalLogged}
              </span>
              <span className="ml-1 text-muted-foreground">
                s {t.time.loggedHours.toLowerCase()}
              </span>
            </span>
            <span className="text-muted-foreground">
              / {billable.totalEstimated}s {t.time.estimated.toLowerCase()}
            </span>
          </div>

          {billable.byProject.some((p) => p.estimated > 0 || p.logged > 0) && (
            <div className="space-y-3">
              {billable.byProject
                .filter((p) => p.estimated > 0 || p.logged > 0)
                .map((p) => {
                  const pct =
                    p.estimated > 0
                      ? Math.min(100, (p.logged / p.estimated) * 100)
                      : p.logged > 0
                        ? 100
                        : 0;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: p.color ?? "var(--primary)" }}
                          />
                          {p.name}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {p.logged}s / {p.estimated}s
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {billable.byUser.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {billable.byUser.map((u) => (
                <span
                  key={u.name}
                  className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                >
                  <UserAvatar name={u.name} image={u.avatar} className="size-5 text-[9px]" />
                  {u.name}
                  <span className="font-semibold tabular-nums">{u.logged}s</span>
                </span>
              ))}
            </div>
          )}

          {billable.totalLogged === 0 && (
            <p className="text-sm text-muted-foreground">{t.time.empty}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
