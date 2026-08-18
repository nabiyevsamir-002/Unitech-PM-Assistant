import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { getPendingApprovalCount, getDailyDigest } from "@/lib/data";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/notifications";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [pendingCount, pending, digest, feed, unread] = await Promise.all([
    getPendingApprovalCount(),
    prisma.approval.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "desc" },
      take: 6,
      select: { id: true, title: true, proposedByAgent: true },
    }),
    getDailyDigest(),
    getRecentNotifications(),
    getUnreadNotificationCount(),
  ]);

  const notifications = pending.map((p) => ({
    id: p.id,
    title: p.title,
    agent: p.proposedByAgent,
  }));

  return (
    <AppShell
      pendingCount={pendingCount}
      notifications={notifications}
      feed={feed}
      unread={unread}
      digest={digest}
      user={{
        name: session.user.name ?? "İstifadəçi",
        email: session.user.email ?? "",
        role: session.user.role ?? "MEMBER",
        image: session.user.image,
      }}
    >
      {children}
    </AppShell>
  );
}
