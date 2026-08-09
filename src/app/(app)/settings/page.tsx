import { auth } from "@/auth";
import { getTeam } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { canManageUsers, canApprove } from "@/lib/constants";
import { getNotifyStatus } from "@/lib/notify";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const session = await auth();
  const team = await getTeam();
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

  // 2FA is offered to approver-role users; fetch their current enrolment state.
  const role = session?.user?.role ?? "MEMBER";
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { totpEnabled: true },
      })
    : null;

  return (
    <SettingsView
      user={{
        name: session?.user?.name ?? "İstifadəçi",
        email: session?.user?.email ?? "",
        role,
      }}
      team={team}
      model={model}
      canManage={canManageUsers(session?.user?.role)}
      currentUserId={session?.user?.id ?? ""}
      totp={{ eligible: canApprove(role), enabled: !!me?.totpEnabled }}
      notifyChannels={getNotifyStatus()}
    />
  );
}
