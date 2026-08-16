import { auth } from "@/auth";
import { azureStt, isAzureSpeechConfigured } from "@/lib/azure/speech";

export const runtime = "nodejs";
export const maxDuration = 30;

// Speech → text via Azure (key stays server-side). Body = a WAV clip (PCM 16 kHz
// mono) recorded in the browser. 503 when Azure isn't configured → browser STT.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  if (!isAzureSpeechConfigured()) {
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "az";

  let audio: ArrayBuffer;
  try {
    audio = await req.arrayBuffer();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!audio || audio.byteLength < 44) {
    return Response.json({ ok: false, error: "empty" }, { status: 400 });
  }

  const text = await azureStt(audio, lang);
  if (text == null) {
    return Response.json({ ok: false, error: "stt_failed" }, { status: 502 });
  }
  return Response.json({ ok: true, text });
}
