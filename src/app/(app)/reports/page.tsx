import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkload, getBillableSummary } from "@/lib/data";
import { isOverdue } from "@/lib/format";
import { TASK_STATUSES, canManageUsers } from "@/lib/constants";
import { isEmailConfigured } from "@/lib/notify/email";
import { ReportsView } from "@/components/reports/reports-view";

export default async function ReportsPage() {
  const [session, workload, tasks, billable] = await Promise.all([
    auth(),
    getWorkload(),
    prisma.task.findMany({ select: { status: true, dueDate: true } }),
    getBillableSummary(),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const s of TASK_STATUSES) statusCounts[s] = 0;
  for (const task of tasks) {
    statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1;
  }

  const overdueCount = tasks.filter(
    (t) => t.status !== "DONE" && isOverdue(t.dueDate),
  ).length;

  return (
    <ReportsView
      workload={workload}
      statusCounts={statusCounts}
      overdueCount={overdueCount}
      totalTasks={tasks.length}
      billable={billable}
      canEmailReport={canManageUsers(session?.user?.role) && isEmailConfigured()}
    />
  );
}
