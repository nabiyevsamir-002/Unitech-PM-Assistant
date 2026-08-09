import { Ollama } from "ollama";

const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

export const ollama = new Ollama({ host });

/** Quick health probe with a short timeout — used to show online/offline. */
export async function isOllamaOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${host}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
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
