import { auth } from "@/auth";
import { getAuditLog } from "@/lib/data";
import { canApprove } from "@/lib/constants";
import { ActivityView } from "@/components/activity/activity-view";

export default async function ActivityPage() {
  const [session, entries] = await Promise.all([auth(), getAuditLog()]);

  return (
    <ActivityView
      entries={entries}
      canRevert={canApprove(session?.user?.role)}
    />
  );
}
