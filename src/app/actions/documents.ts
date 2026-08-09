"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canApprove } from "@/lib/constants";
import { chunkText } from "@/lib/rag/chunk";
import { embedBatch } from "@/lib/rag/embed";

type Result = { ok: boolean; message: string };

async function requirePM() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, message: "Sessiya bitib. Yenidən daxil olun." };
  if (!canApprove(session.user.role)) {
    return { ok: false as const, message: "Sənəd idarə etmək icazəniz yoxdur." };
  }
  return { ok: true as const, session };
}

const ingestInput = z.object({
  title: z.string().min(1, "Başlıq boş ola bilməz"),
  content: z.string().min(1, "Mətn boş ola bilməz"),
});

/**
 * Ingests a document for RAG: chunk → embed (local Ollama) → store. Q&A over
 * these happens in the AI panel (retrieval grounds the answer). PM+ only.
 */
export async function ingestDocument(
  input: z.input<typeof ingestInput>,
): Promise<Result> {
  const guard = await requirePM();
  if (!guard.ok) return guard;

  const parsed = ingestInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Məlumat düzgün deyil." };
  }

  const chunks = chunkText(parsed.data.content);
  if (chunks.length === 0) return { ok: false, message: "Sənəddə mətn tapılmadı." };

  let vectors: number[][];
  try {
    vectors = await embedBatch(chunks);
  } catch {
    return {
      ok: false,
      message: "Embedding modeli əlçatmazdır (Ollama işləmir və ya model yüklənməyib).",
    };
  }
  if (vectors.length !== chunks.length) {
    return { ok: false, message: "Embedding alınmadı. Bir azdan yenidən cəhd edin." };
  }

  const doc = await prisma.document.create({
    data: {
      title: parsed.data.title.trim(),
      source: "paste",
      chunks: {
        create: chunks.map((content, i) => ({
          index: i,
          content,
          embedding: JSON.stringify(vectors[i] ?? []),
        })),
      },
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: `user:${guard.session.user.id}`,
      action: "DOCUMENT_ADDED",
      entity: `document:${doc.id}`,
      after: JSON.stringify({ title: doc.title, chunks: chunks.length }),
    },
  });

  revalidatePath("/documents");
  return { ok: true, message: `Sənəd əlavə edildi (${chunks.length} hissə).` };
}

export async function deleteDocument(id: string): Promise<Result> {
  const guard = await requirePM();
  if (!guard.ok) return guard;

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return { ok: false, message: "Sənəd tapılmadı." };

  await prisma.document.delete({ where: { id } }); // cascades chunks
  await prisma.auditLog.create({
    data: {
      actor: `user:${guard.session.user.id}`,
      action: "DOCUMENT_DELETED",
      entity: `document:${id}`,
      before: JSON.stringify({ title: doc.title }),
    },
  });

  revalidatePath("/documents");
  return { ok: true, message: "Sənəd silindi." };
}
