import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOnboardingState, getTeam } from "@/lib/data";
import { canManageUsers } from "@/lib/constants";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

const DEFAULT_EXCEL_PATH = "sample-data/azeribank-mobil.xlsx";

export default async function OnboardingPage() {
  const session = await auth();
  if (!canManageUsers(session?.user?.role)) {
    redirect("/dashboard");
  }

  const [state, team] = await Promise.all([getOnboardingState(), getTeam()]);

  return (
    <OnboardingWizard
      projects={state.projects}
      members={team}
      defaultFilePath={DEFAULT_EXCEL_PATH}
    />
  );
}
