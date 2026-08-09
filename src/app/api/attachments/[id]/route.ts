import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readFileBytes, removeFile } from "@/lib/attachments";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return new Response("not found", { status: 404 });

  try {
    const bytes = await readFileBytes(att.storagePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": att.fileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(att.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("file missing", { status: 410 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return new Response("not found", { status: 404 });

  await removeFile(att.storagePath);
  await prisma.attachment.delete({ where: { id } });

  return Response.json({ ok: true });
}
