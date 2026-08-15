"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers, ROLES } from "@/lib/constants";

type Result = { ok: boolean; message: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, message: "Sessiya bitib." };
  if (!canManageUsers(session.user.role)) {
    return {
      ok: false as const,
      message: "Komandanı idarə etmək icazəniz yoxdur.",
    };
  }
  return { ok: true as const, session };
}

const createInput = z.object({
  name: z.string().min(1),
  // Optional: employees who only need to appear in the roster / be assignable
  // don't need a login. Blank → we generate a unique placeholder address.
  email: z.union([z.string().email(), z.literal("")]).optional(),
  position: z.string().max(120).optional(),
  role: z.enum(ROLES).default("MEMBER"),
  weeklyCapacityHours: z.number().int().min(0).max(168).default(40),
  password: z.string().min(6).default("demo1234"),
});

export async function createUser(
  input: z.input<typeof createInput>,
): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = createInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Məlumat düzgün deyil." };
  }

  let email = (parsed.data.email ?? "").toLowerCase().trim();
  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { ok: false, message: "Bu e-poçt artıq istifadə olunur." };
  } else {
    // Non-login employee: synthesize a unique, unusable placeholder address.
    const slug =
      parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "isci";
    email = `${slug}-${Date.now().toString(36)}@employee.local`;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const created = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      role: parsed.data.role,
      position: parsed.data.position?.trim() || null,
      weeklyCapacityHours: parsed.data.weeklyCapacityHours,
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: `user:${guard.session.user.id}`,
      action: "USER_CREATED",
      entity: `user:${created.id}`,
      after: JSON.stringify({ email, role: created.role }),
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: "Üzv əlavə edildi." };
}

const updateInput = z.object({
  role: z.enum(ROLES).optional(),
  position: z.string().max(120).nullable().optional(),
  weeklyCapacityHours: z.number().int().min(0).max(168).optional(),
  unavailableFrom: z.string().nullable().optional(),
  unavailableTo: z.string().nullable().optional(),
});

export async function updateUser(
  id: string,
  input: z.input<typeof updateInput>,
): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Məlumat düzgün deyil." };

  await prisma.user.update({
    where: { id },
    data: {
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.position !== undefined
        ? { position: parsed.data.position?.trim() || null }
        : {}),
      ...(parsed.data.weeklyCapacityHours !== undefined
        ? { weeklyCapacityHours: parsed.data.weeklyCapacityHours }
        : {}),
      ...(parsed.data.unavailableFrom !== undefined
        ? { unavailableFrom: parsed.data.unavailableFrom ? new Date(parsed.data.unavailableFrom) : null }
        : {}),
      ...(parsed.data.unavailableTo !== undefined
        ? { unavailableTo: parsed.data.unavailableTo ? new Date(parsed.data.unavailableTo) : null }
        : {}),
    },
  });
  revalidatePath("/settings");
  return { ok: true, message: "Üzv yeniləndi." };
}

/** Offboarding: deactivate revokes access instantly (auth blocks inactive users). */
export async function setUserActive(
  id: string,
  active: boolean,
): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  // Prevent locking yourself out.
  if (!active && id === guard.session.user.id) {
    return { ok: false, message: "Özünüzü deaktiv edə bilməzsiniz." };
  }

  await prisma.user.update({ where: { id }, data: { isActive: active } });
  await prisma.auditLog.create({
    data: {
      actor: `user:${guard.session.user.id}`,
      action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      entity: `user:${id}`,
    },
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message: active
      ? "Üzv yenidən aktiv edildi."
      : "Üzv deaktiv edildi — girişi ləğv olundu.",
  };
}

/**
 * Hard-delete an employee from the roster. Safe by schema: their tasks and
 * decided approvals fall back to unassigned (onDelete: SetNull) and their time
 * logs cascade away (onDelete: Cascade) — nothing else references a user.
 */
export async function deleteUser(id: string): Promise<Result> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  // Never delete the account you're signed in with.
  if (id === guard.session.user.id) {
    return { ok: false, message: "Özünüzü silə bilməzsiniz." };
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { ok: false, message: "İşçi tapılmadı." };

  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actor: `user:${guard.session.user.id}`,
      action: "USER_DELETED",
      entity: `user:${id}`,
      after: JSON.stringify({ name: user.name, email: user.email }),
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: `${user.name} silindi.` };
}
