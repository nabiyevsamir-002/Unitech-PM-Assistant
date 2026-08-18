"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Radar,
  Send,
  ShieldAlert,
  GitCompare,
} from "lucide-react";
import { toast } from "sonner";
import { MetricCard } from "./metric-card";
import { BoardPreview, BoardPreviewHeader } from "./board-preview";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { runAgentScanAction } from "@/app/actions/agents";
import { sendWeeklyReportNowAction, sendRiskAlertNowAction } from "@/app/actions/notify";
import type { ApprovalDTO, TaskDTO } from "@/lib/types";
import type { ProjectHealth } from "@/lib/reports/health";

export function DashboardView({
  userName,
  metrics,
  topApproval,
  boardTasks,
  canApprove,
  health,
}: {
  userName: string;
  metrics: {
    activeProjects: number;
    dueToday: number;
    overdue: number;
    pendingApprovals: number;
  };
  topApproval: ApprovalDTO | null;
  boardTasks: TaskDTO[];
  canApprove: boolean;
  health: ProjectHealth[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [scanning, startScan] = useTransition();

  const runScan = () =>
    startScan(async () => {
      const res = await runAgentScanAction();
      if (res.ok) {
        const n = res.summary?.created ?? 0;
        toast.success(
          n > 0 ? `${t.ai.scanDone}: ${n} ${t.ai.scanCreated}` : t.ai.scanNoFindings,
        );
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  const [sendingDigest, startDigest] = useTransition();
  const sendDigest = () =>
    startDigest(async () => {
      const res = await sendWeeklyReportNowAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });

  const [checkingRisks, startRisks] = useTransition();
  const checkRisks = () =>
    startRisks(async () => {
      const res = await sendRiskAlertNowAction();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.dashboard.welcome}, {userName.split(" ")[0]}.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label={t.dashboard.activeProjects}
          value={metrics.activeProjects}
          icon={FolderKanban}
          href="/projects"
        />
        <MetricCard
          label={t.dashboard.dueToday}
          value={metrics.dueToday}
          icon={CalendarClock}
          tone="warning"
          href="/board"
        />
        <MetricCard
          label={t.dashboard.overdue}
          value={metrics.overdue}
          icon={AlertTriangle}
          tone="danger"
          href="/board"
        />
        <MetricCard
          label={t.dashboard.pendingApprovals}
          value={metrics.pendingApprovals}
          icon={CheckCircle2}
          tone="success"
          href="/approvals"
        />
      </div>

      {/* Project health */}
      <ProjectHealthSection health={health} t={t} />

      {/* AI suggestion */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4.5 text-primary" />
            <h2 className="text-base font-semibold">
              {t.dashboard.aiSuggestion}
            </h2>
          </div>
          {canApprove && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={checkRisks}
                disabled={checkingRisks}
                title={t.dashboard.checkRisks}
              >
                <ShieldAlert className={cn("size-4", checkingRisks && "animate-pulse")} />
                <span className="hidden sm:inline">
                  {checkingRisks ? t.dashboard.checkingRisks : t.dashboard.checkRisks}
                </span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={sendDigest}
                disabled={sendingDigest}
                title={t.dashboard.sendDigest}
              >
                <Send className={cn("size-4", sendingDigest && "animate-pulse")} />
                <span className="hidden sm:inline">
                  {sendingDigest ? t.dashboard.sendingDigest : t.dashboard.sendDigest}
                </span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={runScan}
                disabled={scanning}
                title={t.ai.scanIdle}
              >
                <Radar className={cn("size-4", scanning && "animate-spin")} />
                <span className="hidden sm:inline">
                  {scanning ? t.ai.scanning : t.ai.scan}
                </span>
              </Button>
            </div>
          )}
        </div>
        {topApproval ? (
          <ApprovalCard
            approval={topApproval}
            canApprove={canApprove}
            highlighted
          />
        ) : (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {t.dashboard.aiSuggestionEmpty}
          </Card>
        )}
        {metrics.pendingApprovals > 1 && (
          <div className="mt-2 text-right">
            <Link
              href="/approvals"
              className="text-sm font-medium text-primary hover:underline"
            >
              +{metrics.pendingApprovals - 1} {t.approvals.pending.toLowerCase()}
            </Link>
          </div>
        )}
      </section>

      {/* Board preview */}
      <section>
        <BoardPreviewHeader />
        <BoardPreview tasks={boardTasks} />
      </section>
    </div>
  );
}

const BAND = {
  good: { text: "text-success", bar: "bg-success", dot: "bg-success" },
  warning: { text: "text-warning", bar: "bg-warning", dot: "bg-warning" },
  critical: { text: "text-destructive", bar: "bg-destructive", dot: "bg-destructive" },
} as const;

function ProjectHealthSection({
  health,
  t,
}: {
  health: ProjectHealth[];
  t: ReturnType<typeof useI18n>["t"];
}) {
  // Surface the projects that need attention first.
  const sorted = [...health].sort((a, b) => a.score - b.score);
  const good = health.filter((h) => h.band === "good").length;
  const warning = health.filter((h) => h.band === "warning").length;
  const critical = health.filter((h) => h.band === "critical").length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t.dashboard.projectHealth}</h2>
        <div className="flex items-center gap-4">
          {health.length > 0 && (
            <div className="hidden items-center gap-3 text-xs font-medium sm:flex">
              <span className="flex items-center gap-1.5 text-success">
                <span className="size-2 rounded-full bg-success" />
                {good} {t.dashboard.healthHealthy}
              </span>
              <span className="flex items-center gap-1.5 text-warning">
                <span className="size-2 rounded-full bg-warning" />
                {warning} {t.dashboard.healthAttention}
              </span>
              <span className="flex items-center gap-1.5 text-destructive">
                <span className="size-2 rounded-full bg-destructive" />
                {critical} {t.dashboard.healthCritical}
              </span>
            </div>
          )}
          {health.length > 1 && (
            <Link
              href="/compare"
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <GitCompare className="size-4" />
              {t.dashboard.compareLink}
            </Link>
          )}
        </div>
      </div>

      {health.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t.dashboard.healthNoProjects}
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {sorted.map((h) => {
            const band = BAND[h.band];
            return (
              <Link
                key={h.projectId}
                href="/projects"
                className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{h.name}</span>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", band.text)}>
                      {h.score}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", band.bar)}
                      style={{ width: `${Math.max(h.score, 3)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      {h.progress}% {t.dashboard.healthDone}
                    </span>
                    {h.overdueCount > 0 && (
                      <span className="text-destructive">
                        {h.overdueCount} {t.dashboard.overdue.toLowerCase()}
                      </span>
                    )}
                    {h.budgetOverrunCount > 0 && (
                      <span className="text-warning">
                        {h.budgetOverrunCount} {t.dashboard.healthBudgetOver}
                      </span>
                    )}
                    {h.anomalyCount > 0 && (
                      <span className="text-warning">
                        {h.anomalyCount} {t.dashboard.healthAnomaly}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </section>
  );
}
