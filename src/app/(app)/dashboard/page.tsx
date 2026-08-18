import { auth } from "@/auth";
import { getDashboardData } from "@/lib/data";
import { getProjectHealth } from "@/lib/reports/health";
import { canApprove } from "@/lib/constants";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const session = await auth();
  const [data, health] = await Promise.all([getDashboardData(), getProjectHealth()]);

  return (
    <DashboardView
      userName={session?.user?.name ?? "İstifadəçi"}
      metrics={data.metrics}
      topApproval={data.topApproval}
      boardTasks={data.boardTasks}
      canApprove={canApprove(session?.user?.role)}
      health={health}
    />
  );
}
