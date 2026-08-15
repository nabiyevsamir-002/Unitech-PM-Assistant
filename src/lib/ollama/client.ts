import { Ollama } from "ollama";

const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

// Optional bearer token — set OLLAMA_API_KEY when Ollama sits behind an
// authenticating proxy (e.g. a remote GPU host). Empty locally = no header.
const apiKey = process.env.OLLAMA_API_KEY?.trim();
const authHeaders: Record<string, string> = apiKey
  ? { Authorization: `Bearer ${apiKey}` }
  : {};

export const ollama = new Ollama({ host, headers: authHeaders });

/** Quick health probe with a short timeout — used to show online/offline. */
export async function isOllamaOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    // 8s (not 1.5s): a remote GPU host over the internet — plus a cold TLS
    // handshake through the RunPod proxy — easily needs more than a second to
    // answer /api/tags. Too tight a timeout wrongly shows the AI as offline.
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${host}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
      headers: authHeaders,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};
