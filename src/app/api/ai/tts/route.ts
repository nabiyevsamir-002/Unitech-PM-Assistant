import { auth } from "@/auth";
import { azureTts, isAzureSpeechConfigured } from "@/lib/azure/speech";

export const runtime = "nodejs";
export const maxDuration = 30;

// Text → speech via Azure (key stays server-side). Returns MP3 audio the client
// plays back. 503 when Azure isn't configured → the client uses browser TTS.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  if (!isAzureSpeechConfigured()) return new Response("not_configured", { status: 503 });

  let body: { text?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad_request", { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return new Response("empty", { status: 400 });
  const lang = body.lang === "en" ? "en" : "az";

  const audio = await azureTts(text, lang);
  if (!audio) return new Response("tts_failed", { status: 502 });

  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
