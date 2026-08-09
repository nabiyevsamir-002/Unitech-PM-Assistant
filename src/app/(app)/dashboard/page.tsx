import { auth } from "@/auth";
import { getDashboardData, getOnboardingState } from "@/lib/data";
import { canApprove, canManageUsers } from "@/lib/constants";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const session = await auth();
  const isAdmin = canManageUsers(session?.user?.role);
  const [data, onboarding] = await Promise.all([
    getDashboardData(),
    isAdmin ? getOnboardingState() : Promise.resolve(null),
  ]);

  return (
    <DashboardView
      userName={session?.user?.name ?? "İstifadəçi"}
      metrics={data.metrics}
      topApproval={data.topApproval}
      boardTasks={data.boardTasks}
      canApprove={canApprove(session?.user?.role)}
      showSetupBanner={isAdmin && !!onboarding?.needsSetup}
    />
  );
}
