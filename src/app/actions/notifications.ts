"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Mark every notification read (the bell's "mark all read"). Any signed-in user. */
export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await prisma.notification.updateMany({
    where: { read: false },
    data: { read: true },
  });
  return { ok: true };
}
