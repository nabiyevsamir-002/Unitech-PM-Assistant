import { prisma } from "@/lib/prisma";
import { embedText } from "./embed";

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type RetrievedChunk = { content: string; title: string; score: number };

/**
 * Semantic search over stored document chunks: embed the query, cosine-rank all
 * chunks (in-DB, demo scale), return the top-k above a relevance floor.
 * Resilient — returns [] if there are no docs or the embed model is offline.
 *
 * NOTE: nomic-embed-text is English-centric and produces compressed cosine
 * scores for Azerbaijani text (related ~0.72 vs unrelated ~0.64), so the FLOOR
 * mostly drops only near-baseline noise — the real relevance guard is (a) top-k
 * ranking (the correct chunk still ranks first) and (b) the answer prompt, which
 * tells the model to fall back if the docs don't actually cover the question.
 * A multilingual embed model (e.g. bge-m3) in production would separate better.
 */
export async function retrieveChunks(
  query: string,
  k = 3,
): Promise<RetrievedChunk[]> {
  const q = query.trim();
  if (!q) return [];

  const chunks = await prisma.documentChunk.findMany({
    include: { document: { select: { title: true } } },
  });
  if (chunks.length === 0) return [];

  let qvec: number[];
  try {
    qvec = await embedText(q);
  } catch {
    return []; // Ollama/embed model unavailable — degrade gracefully
  }
  if (qvec.length === 0) return [];

  const scored = chunks.map((c) => {
    let vec: number[] = [];
    try {
      vec = JSON.parse(c.embedding) as number[];
    } catch {
      vec = [];
    }
    return { content: c.content, title: c.document.title, score: cosine(qvec, vec) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0.5).slice(0, k);
}

/** Formats retrieved chunks as an English grounding block for the answer model. */
export function formatDocContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const parts = chunks.map(
    (c, i) => `[Doc ${i + 1} — "${c.title}"]\n${c.content}`,
  );
  return `\n\n=== COMPANY DOCUMENTS (retrieved for this question) ===\n${parts.join("\n\n")}`;
}
