import { auth } from "@/auth";
import { getApprovals } from "@/lib/data";
import { canApprove } from "@/lib/constants";
import { ApprovalsView } from "@/components/approvals/approvals-view";

export default async function ApprovalsPage() {
  const session = await auth();
  const [pending, approved, rejected] = await Promise.all([
    getApprovals("PENDING"),
    getApprovals("APPROVED"),
    getApprovals("REJECTED"),
  ]);

  return (
    <ApprovalsView
      pending={pending}
      approved={approved}
      rejected={rejected}
      canApprove={canApprove(session?.user?.role)}
    />
  );
}
