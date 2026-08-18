// In-app notifications (topbar bell). Server-only helpers. A shared feed for the
// small 2-person workspace: created deterministically (risk scan, etc.) and read
// together. The `markNotificationsRead` server action lives in app/actions.

import { prisma } from "@/lib/prisma";

export type NotificationFeedItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function createNotification(data: {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
    },
  });
}

export async function getRecentNotifications(limit = 12): Promise<NotificationFeedItem[]> {
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  return prisma.notification.count({ where: { read: false } });
}
