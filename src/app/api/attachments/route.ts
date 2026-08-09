import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_FILE_BYTES,
  saveFile,
  storagePathFor,
  safeFileName,
} from "@/lib/attachments";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const file = form.get("file");
  const taskId = (form.get("taskId") as string) || null;
  const projectId = (form.get("projectId") as string) || null;

  if (!(file instanceof File)) {
    return new Response("no file", { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { ok: false, message: "Fayl çox böyükdür (maks. 10 MB)." },
      { status: 413 },
    );
  }
  if (!taskId && !projectId) {
    return new Response("missing target", { status: 400 });
  }

  const id = randomUUID();
  const rel = storagePathFor(id, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await saveFile(rel, bytes);

  const attachment = await prisma.attachment.create({
    data: {
      id,
      taskId,
      projectId,
      fileName: safeFileName(file.name),
      fileType: file.type || null,
      storagePath: rel,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: `user:${session.user.id}`,
      action: "ATTACHMENT_UPLOADED",
      entity: taskId ? `task:${taskId}` : `project:${projectId}`,
      after: JSON.stringify({ fileName: attachment.fileName }),
    },
  });

  return Response.json({
    ok: true,
    attachment: {
      id: attachment.id,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      createdAt: attachment.createdAt.toISOString(),
    },
  });
}
