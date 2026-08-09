import { ollama } from "@/lib/ollama/client";

// Local embedding model (Ollama). 768-dim vectors. Pulled via
// `ollama pull nomic-embed-text`.
export const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

/** Embeds many texts in one call. Throws if Ollama / the model is unavailable. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await ollama.embed({ model: EMBED_MODEL, input: texts });
  return (res.embeddings as number[][]) ?? [];
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec ?? [];
}
