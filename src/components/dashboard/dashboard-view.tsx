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
  Rocket,
  ArrowRight,
  Radar,
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
import type { ApprovalDTO, TaskDTO } from "@/lib/types";

export function DashboardView({
  userName,
  metrics,
  topApproval,
  boardTasks,
  canApprove,
  showSetupBanner = false,
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
  showSetupBanner?: boolean;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.dashboard.welcome}, {userName.split(" ")[0]}.
        </p>
      </div>

      {showSetupBanner && (
        <Card className="flex flex-col items-start justify-between gap-3 border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Rocket className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-medium">{t.onboarding.bannerTitle}</p>
              <p className="text-sm text-muted-foreground">
                {t.onboarding.bannerText}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/onboarding">
              {t.onboarding.bannerCta}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      )}

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
